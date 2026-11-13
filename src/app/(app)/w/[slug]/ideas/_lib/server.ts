import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, ideas, ideaUrgency, memberships, user, type Idea, type Organization } from "@/db/schema";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { IDEA_FREQUENCIES, estimateAnnualHours, frequencyLabel } from "@/lib/ideas";
import { IDEA_URGENCY, labelFrom } from "@/lib/taxonomy";
import { zOptNumber, zOptText } from "../../_lib/action-utils";

/** Public, shareable intake URL for a workspace's current token. */
export const intakeUrl = (token: string) => `${appUrl()}/intake/${token}`;

/* ───────────────────────────── Form parsing ───────────────────────────── */

const FREQUENCY_SLUGS = IDEA_FREQUENCIES.map((f) => f.slug) as [string, ...string[]];

export const ideaFieldsSchema = z.object({
  title: z.string().trim().min(3, "must be at least 3 characters").max(160),
  problem: z.string().trim().min(10, "please describe the problem in a sentence or two").max(5000),
  desiredOutcome: zOptText(2000),
  department: zOptText(100),
  frequency: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(FREQUENCY_SLUGS).nullable()),
  peopleAffected: zOptNumber({ min: 1, max: 1_000_000, int: true }),
  hoursPerWeek: zOptNumber({ min: 0, max: 168 }),
  systemsInvolved: zOptText(300),
  urgency: z.enum(ideaUrgency.enumValues),
});

export type IdeaFields = z.infer<typeof ideaFieldsSchema>;

const get = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};

/** Parse the shared idea fields (in-app form and public intake form). Throws ZodError. */
export function parseIdeaFields(form: FormData): IdeaFields {
  return ideaFieldsSchema.parse({
    title: get(form, "title") ?? "",
    problem: get(form, "problem") ?? "",
    desiredOutcome: get(form, "desiredOutcome"),
    department: get(form, "department"),
    frequency: get(form, "frequency"),
    peopleAffected: get(form, "peopleAffected"),
    hoursPerWeek: get(form, "hoursPerWeek"),
    systemsInvolved: get(form, "systemsInvolved"),
    urgency: get(form, "urgency") || "medium",
  });
}

/* ───────────────────────────── Limits ───────────────────────────── */

/** Per submitter email, per workspace, per rolling 24 hours (intake link). */
export const INTAKE_DAILY_LIMIT_PER_EMAIL = 5;
/** Per workspace, per rolling 24 hours, across all intake-link submitters (flood guard). */
export const INTAKE_DAILY_LIMIT_PER_ORG = 200;

export async function countRecentIdeas(orgId: string, opts: { email?: string; channel?: string }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ideas)
    .where(
      and(
        eq(ideas.orgId, orgId),
        gte(ideas.createdAt, since),
        opts.email ? sql`lower(${ideas.submitterEmail}) = ${opts.email.toLowerCase()}` : undefined,
        opts.channel ? eq(ideas.channel, opts.channel) : undefined,
      ),
    );
  return row?.n ?? 0;
}

/* ───────────────────────────── Activity ───────────────────────────── */

/** Activity entries for ideas carry `detail.ideaId`; this logs without a signed-in actor (intake link). */
export async function logIdeaActivity(orgId: string, userId: string | null, action: string, detail: Record<string, unknown>) {
  await db.insert(activityLog).values({ orgId, userId, action, detail });
}

export async function loadIdeaHistory(orgId: string, ideaId: string) {
  return db
    .select({ id: activityLog.id, action: activityLog.action, detail: activityLog.detail, createdAt: activityLog.createdAt, userName: user.name })
    .from(activityLog)
    .leftJoin(user, eq(activityLog.userId, user.id))
    .where(and(eq(activityLog.orgId, orgId), sql`${activityLog.detail}->>'ideaId' = ${ideaId}`))
    .orderBy(desc(activityLog.createdAt))
    .limit(30);
}

/* ───────────────────────────── Email ───────────────────────────── */

const TRIAGE_ROLES = ["owner", "admin", "editor"] as const;
const MAX_TRIAGE_RECIPIENTS = 25;

const p = (html: string) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55">${html}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:20px 0 4px"><a href="${escapeHtml(href)}" style="display:inline-block;background:#0b1220;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px">${escapeHtml(label)}</a></p>`;
const quote = (text: string) =>
  `<div style="margin:0 0 12px;padding:10px 14px;border-left:3px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:14px;line-height:1.55;white-space:pre-line">${escapeHtml(text)}</div>`;

/** Fire-and-forget after the response; email failures never fail the user's action. */
function sendLater(messages: Parameters<typeof sendEmail>[0][]) {
  if (messages.length === 0) return;
  after(async () => {
    const results = await Promise.allSettled(messages.map((m) => sendEmail(m)));
    results.forEach((r, i) => {
      if (r.status === "rejected" || r.value.status === "failed")
        console.error("[ideas] email failed", messages[i].to, r.status === "rejected" ? r.reason : r.value.error);
    });
  });
}

const ideaUrl = (org: Pick<Organization, "slug">, ideaId: string) => `${appUrl()}/w/${org.slug}/ideas/${ideaId}`;

/**
 * One "new idea" email per triager (workspace owners, admins and editors), never to the submitter.
 */
export async function notifyTriagersOfNewIdea(org: Pick<Organization, "id" | "name" | "slug">, idea: Idea) {
  const recipients = await db
    .select({ email: user.email, name: user.name })
    .from(memberships)
    .innerJoin(user, eq(memberships.userId, user.id))
    .where(and(eq(memberships.orgId, org.id), inArray(memberships.role, [...TRIAGE_ROLES])))
    .orderBy(asc(memberships.createdAt))
    .limit(MAX_TRIAGE_RECIPIENTS + 1);
  const submitter = idea.submitterEmail.toLowerCase();
  const to = [...new Set(recipients.map((r) => r.email.toLowerCase()))].filter((e) => e !== submitter).slice(0, MAX_TRIAGE_RECIPIENTS);

  const hours = estimateAnnualHours(idea);
  const facts = [
    idea.department ? `Department: ${idea.department}` : null,
    `Urgency: ${labelFrom(IDEA_URGENCY, idea.urgency)}`,
    idea.frequency ? `Frequency: ${frequencyLabel(idea.frequency)}` : null,
    hours != null ? `≈ ${hours.toLocaleString("en-US")} hours/yr spent today` : null,
  ].filter(Boolean) as string[];
  const via = idea.channel === "intake_link" ? "the intake link" : "the workspace";
  const subject = `New AI idea: ${idea.title}`;
  const html = emailLayout({
    preheader: `${idea.submitterName} submitted an idea to ${org.name}'s AI team.`,
    body:
      p(`<strong>${escapeHtml(idea.submitterName)}</strong> (${escapeHtml(idea.submitterEmail)}) submitted a new AI idea via ${via}.`) +
      `<h2 style="margin:16px 0 8px;font-size:17px">${escapeHtml(idea.title)}</h2>` +
      quote(idea.problem.length > 600 ? `${idea.problem.slice(0, 600)}…` : idea.problem) +
      p(`<span style="color:#475569">${facts.map(escapeHtml).join(" · ")}</span>`) +
      button(ideaUrl(org, idea.id), "Review the idea"),
    footer: `You're receiving this because you can triage AI ideas in the ${escapeHtml(org.name)} workspace on AI Radar.`,
  });
  const text = `${idea.submitterName} submitted a new AI idea via ${via}: "${idea.title}"\n\n${idea.problem}\n\n${facts.join(" · ")}\n\nReview it: ${ideaUrl(org, idea.id)}`;
  sendLater(to.map((email) => ({ to: email, subject, html, text })));
}

const submitterFooter = (orgName: string) =>
  `You're receiving this because you submitted an AI idea to ${escapeHtml(orgName)}'s AI team through AI Radar.`;

/** Receipt for an idea submitted through the public intake link. */
export function sendIntakeConfirmation(org: Pick<Organization, "name">, idea: Idea) {
  const html = emailLayout({
    preheader: `We received your idea "${idea.title}".`,
    body:
      p(`Hi ${escapeHtml(idea.submitterName.split(" ")[0] ?? idea.submitterName)},`) +
      p(`Thanks for sharing your idea with ${escapeHtml(org.name)}'s AI team. Here's what you sent:`) +
      `<h2 style="margin:16px 0 8px;font-size:17px">${escapeHtml(idea.title)}</h2>` +
      quote(idea.problem) +
      p("The team reviews new ideas regularly. We'll email you when it's been accepted onto the AI roadmap or if it's not a fit right now."),
    footer: submitterFooter(org.name),
  });
  sendLater([
    {
      to: idea.submitterEmail,
      subject: `We received your AI idea: ${idea.title}`,
      html,
      text: `Thanks for sharing your idea with ${org.name}'s AI team: "${idea.title}". We'll email you when it's been reviewed.`,
    },
  ]);
}

/** Tell the submitter what happened to their idea. */
export function notifySubmitterOfDecision(
  org: Pick<Organization, "name" | "slug">,
  idea: Idea,
  decision:
    | { kind: "accepted"; initiativeTitle: string }
    | { kind: "declined"; reason: string }
    | { kind: "duplicate"; ofTitle: string; isInitiative: boolean },
) {
  const first = escapeHtml(idea.submitterName.split(" ")[0] ?? idea.submitterName);
  // Only in-app submitters have an account that can open the workspace.
  const link = idea.submittedById ? button(ideaUrl(org, idea.id), "View your idea") : "";
  let subject: string;
  let body: string;
  let text: string;
  if (decision.kind === "accepted") {
    subject = `Your AI idea was accepted: ${idea.title}`;
    body =
      p(`Hi ${first},`) +
      p(`Good news — ${escapeHtml(org.name)}'s AI team accepted your idea <strong>“${escapeHtml(idea.title)}”</strong>. It's now on the AI roadmap as the initiative <strong>“${escapeHtml(decision.initiativeTitle)}”</strong>, where the team will evaluate it.`) +
      p("Thanks for helping the company find where AI can make a difference.") +
      link;
    text = `${org.name}'s AI team accepted your idea "${idea.title}". It's now on the AI roadmap as "${decision.initiativeTitle}".`;
  } else if (decision.kind === "declined") {
    subject = `An update on your AI idea: ${idea.title}`;
    body =
      p(`Hi ${first},`) +
      p(`Thanks for submitting <strong>“${escapeHtml(idea.title)}”</strong>. ${escapeHtml(org.name)}'s AI team reviewed it and decided not to take it forward right now:`) +
      quote(decision.reason) +
      p("Please keep the ideas coming — a different angle or more detail on the time it would save can change the picture.") +
      link;
    text = `${org.name}'s AI team reviewed your idea "${idea.title}" and decided not to take it forward right now: ${decision.reason}`;
  } else {
    subject = `An update on your AI idea: ${idea.title}`;
    const what = decision.isInitiative ? "an initiative already on the AI roadmap" : "an idea the team is already looking at";
    body =
      p(`Hi ${first},`) +
      p(`Thanks for submitting <strong>“${escapeHtml(idea.title)}”</strong>. It overlaps with ${what}: <strong>“${escapeHtml(decision.ofTitle)}”</strong>, so the team will track it there.`) +
      p("Great minds think alike — keep the ideas coming.") +
      link;
    text = `Your idea "${idea.title}" overlaps with ${what}: "${decision.ofTitle}". The team will track it there.`;
  }
  sendLater([{ to: idea.submitterEmail, subject, html: emailLayout({ preheader: subject, body, footer: submitterFooter(org.name) }), text }]);
}
