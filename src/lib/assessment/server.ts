import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { assessments, engagementEvents, user as userTable } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { companyDomain, emailDomain, guessCompanyName, isWorkEmail } from "@/lib/email-domains";
import { appUrl } from "@/lib/env";
import { industryLabel } from "@/lib/taxonomy";
import { functionLabel, roleLabel, toolLabel, DIMENSIONS } from "./questions";
import { recommendationsFor } from "./recommendations";
import { levelById, readContext, type AssessmentContext } from "./scoring";
import { selectStarterTemplates } from "./templates";
import { BRAND } from "@/lib/brand";

export type Assessment = typeof assessments.$inferSelect;

export const newClaimToken = () => randomBytes(24).toString("base64url");

/** Claim tokens are 32 url-safe characters; anything else is rejected before touching the DB. */
export const isClaimTokenShape = (token: unknown): token is string => typeof token === "string" && /^[\w-]{20,64}$/.test(token);
export const isUuid = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const isStaff = (u: Pick<CurrentUser, "platformRole"> | null | undefined) =>
  u?.platformRole === "admin" || u?.platformRole === "consultant";

export async function findByToken(token: string): Promise<Assessment | null> {
  if (!isClaimTokenShape(token)) return null;
  const [row] = await db.select().from(assessments).where(eq(assessments.claimToken, token)).limit(1);
  return row ?? null;
}

/** The full report is visible to its owner and to North Labs staff; everyone else gets null (→ 404). */
export async function findForViewer(id: string, viewer: CurrentUser): Promise<Assessment | null> {
  if (!isUuid(id)) return null;
  const [row] = await db.select().from(assessments).where(eq(assessments.id, id)).limit(1);
  if (!row) return null;
  if (row.userId === viewer.id || isStaff(viewer)) return row;
  return null;
}

export type ClaimResult =
  | { status: "claimed"; assessment: Assessment }
  | { status: "already_yours"; assessment: Assessment }
  | { status: "taken" }
  | { status: "not_found" };

/**
 * Attaches an anonymous assessment to `current`. Atomic: the row is only updated while unclaimed,
 * so two accounts racing for the same token can't both win. Also re-attributes the anonymous
 * `assessment_completed` event so it shows on the lead's timeline.
 */
export async function claimAssessment(token: string, current: CurrentUser): Promise<ClaimResult> {
  if (!isClaimTokenShape(token)) return { status: "not_found" };
  const [claimed] = await db
    .update(assessments)
    .set({ userId: current.id, claimedAt: new Date() })
    .where(and(eq(assessments.claimToken, token), isNull(assessments.userId)))
    .returning();
  if (claimed) {
    await db
      .update(engagementEvents)
      .set({ userId: current.id })
      .where(
        and(
          isNull(engagementEvents.userId),
          eq(engagementEvents.type, "assessment_completed"),
          sql`${engagementEvents.metadata}->>'assessmentId' = ${claimed.id}`,
        ),
      );
    await prefillProfile(current, claimed);
    return { status: "claimed", assessment: claimed };
  }
  const existing = await findByToken(token);
  if (!existing) return { status: "not_found" };
  return existing.userId === current.id ? { status: "already_yours", assessment: existing } : { status: "taken" };
}

/** Fill empty profile fields from the assessment so onboarding is prefilled (never overwrites). */
async function prefillProfile(current: CurrentUser, a: Assessment) {
  const ctx = readContext(a.context);
  if (!ctx) return;
  const patch: Partial<typeof userTable.$inferInsert> = {};
  if (!current.industry) patch.industry = ctx.industry;
  if (!current.companySize) patch.companySize = ctx.companySize;
  if (Object.keys(patch).length) await db.update(userTable).set(patch).where(eq(userTable.id, current.id));
}

/* ───────────────────────────── Presentation helpers ───────────────────────────── */

export function companyNameFor(u: Pick<CurrentUser, "company" | "companyDomain" | "email" | "name">): string {
  if (u.company?.trim()) return u.company.trim();
  if (u.companyDomain) return guessCompanyName(u.companyDomain);
  if (isWorkEmail(u.email)) return guessCompanyName(companyDomain(emailDomain(u.email)));
  const first = u.name.trim().split(/\s+/)[0];
  return first ? `${first}'s company` : "My company";
}

export function summarize(a: Assessment) {
  const context = readContext(a.context);
  const level = levelById(a.level);
  const overall = Number(a.scores.overall ?? 0);
  const recs = recommendationsFor(a.scores);
  const templates = context
    ? selectStarterTemplates({ functions: context.functions, industry: context.industry, tools: context.tools, overall })
    : [];
  return { context, level, overall, recs, templates };
}

export function describeContext(c: AssessmentContext | null) {
  if (!c) return [];
  return [
    ["Industry", industryLabel(c.industry)],
    ["Company size", `${c.companySize} employees`],
    ["Role", roleLabel(c.role)],
    ["Focus areas", c.functions.map(functionLabel).join(", ")],
    ["AI tools in use", c.tools.length ? c.tools.map(toolLabel).join(", ") : "None yet"],
  ] as const;
}

/* ───────────────────────────── Email ───────────────────────────── */

function scoreRowsHtml(a: Assessment) {
  return DIMENSIONS.map((d) => {
    const s = Math.max(0, Math.min(100, Number(a.scores[d.id] ?? 0)));
    return `<tr><td style="padding:4px 12px 4px 0;font-size:14px;color:#334155;white-space:nowrap">${escapeHtml(d.label)}</td>
<td style="padding:4px 0;width:100%"><div style="background:#e2e8f0;border-radius:4px;height:8px"><div style="background:#12b393;border-radius:4px;height:8px;width:${s}%"></div></div></td>
<td style="padding:4px 0 4px 12px;font-size:14px;font-weight:600;color:#0f172a;text-align:right">${s}</td></tr>`;
  }).join("");
}

/** Emails the report summary to its owner, and alerts North Labs about work-email leads. */
export async function sendClaimEmails(a: Assessment, owner: CurrentUser) {
  const { context, level, overall, recs, templates } = summarize(a);
  const reportUrl = `${appUrl()}/assessment/${a.id}`;
  const levelLabel = level?.label ?? a.level;

  const priorities = recs.priorities
    .map((p) => `<li style="margin:0 0 10px"><strong>${escapeHtml(p.label)} (${p.score}/100):</strong> ${escapeHtml(p.headline)}.<br><span style="color:#475569">Next step: ${escapeHtml(p.nextSteps[0] ?? "")}</span></li>`)
    .join("");
  const starters = templates
    .slice(0, 3)
    .map((t) => `<li style="margin:0 0 6px">${escapeHtml(t.title)}</li>`)
    .join("");

  const body = `
<p style="margin:0 0 4px;font-size:13px;color:#0b7363;font-weight:600;text-transform:uppercase;letter-spacing:.04em">AI readiness report</p>
<h1 style="margin:0 0 12px;font-size:22px;color:#0f172a">${escapeHtml(levelLabel)} · ${overall}/100</h1>
<p style="margin:0 0 16px;color:#334155">${escapeHtml(level?.summary ?? "")}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${scoreRowsHtml(a)}</table>
${priorities ? `<h2 style="margin:0 0 8px;font-size:16px;color:#0f172a">Where to focus first</h2><ol style="margin:0 0 20px;padding-left:20px;color:#0f172a;font-size:14px">${priorities}</ol>` : ""}
${starters ? `<h2 style="margin:0 0 8px;font-size:16px;color:#0f172a">Suggested starter initiatives</h2><ul style="margin:0 0 20px;padding-left:20px;color:#0f172a;font-size:14px">${starters}</ul>` : ""}
<p style="margin:0 0 20px"><a href="${reportUrl}" style="display:inline-block;background:#0b1220;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">View your full report</a></p>
<p style="margin:0;color:#475569;font-size:14px">From the report you can create a free AI portfolio workspace pre-filled with these initiatives, or <a href="${appUrl()}/contact?from=assessment" style="color:#0b7363">talk to North Labs</a> about your results.</p>`;

  const text = [
    `Your AI readiness: ${levelLabel} (${overall}/100)`,
    ...DIMENSIONS.map((d) => `- ${d.label}: ${Number(a.scores[d.id] ?? 0)}/100`),
    "",
    ...recs.priorities.map((p) => `Focus: ${p.label}: ${p.nextSteps[0] ?? p.headline}`),
    "",
    `Full report: ${reportUrl}`,
  ].join("\n");

  const sends: Promise<unknown>[] = [
    sendEmail({
      to: owner.email,
      subject: `Your AI readiness report: ${levelLabel} (${overall}/100)`,
      html: emailLayout({ preheader: `${levelLabel} · ${overall}/100. Your strengths, gaps and next steps.`, body }),
      text,
    }),
  ];

  const notify = process.env.CONTACT_NOTIFY_EMAIL;
  if (notify && isWorkEmail(owner.email)) {
    const leadUrl = `${appUrl()}/admin/leads/${owner.id}`;
    const ctxRows = describeContext(context)
      .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#64748b;font-size:13px">${k}</td><td style="font-size:13px">${escapeHtml(v)}</td></tr>`)
      .join("");
    sends.push(
      sendEmail({
        to: notify,
        subject: `Readiness assessment: ${owner.name} (${companyNameFor(owner)}) · ${levelLabel} ${overall}/100`,
        html: emailLayout({
          body: `<p style="margin:0 0 12px"><strong>${escapeHtml(owner.name)}</strong> &lt;${escapeHtml(owner.email)}&gt; completed the AI readiness assessment.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px">${ctxRows}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${scoreRowsHtml(a)}</table>
<p style="margin:0 0 8px;font-size:14px">Weakest areas: ${escapeHtml(recs.priorities.map((p) => p.label).join(", ") || "none")}</p>
<p style="margin:0"><a href="${leadUrl}" style="color:#0b7363">Open lead</a> · <a href="${reportUrl}" style="color:#0b7363">Open report</a></p>`,
          footer: `Internal notification from ${BRAND}.`,
        }),
      }),
    );
  }
  const results = await Promise.allSettled(sends);
  for (const r of results) if (r.status === "rejected") console.error("[assessment] email failed", r.reason);
}
