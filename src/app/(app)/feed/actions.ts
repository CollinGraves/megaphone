"use server";

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { engagementEvents, savedStories, stories, user } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { classifyEmail, companyDomain, emailDomain } from "@/lib/email-domains";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { addStackItem, setStackItemStatus } from "@/lib/graph/stack";
import { track } from "@/lib/tracking";
import type { ActionState } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export async function toggleSavedStory(storyId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const [story] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story) return { ok: false };
  const deleted = await db
    .delete(savedStories)
    .where(and(eq(savedStories.userId, user.id), eq(savedStories.storyId, storyId)))
    .returning();
  if (deleted.length === 0) await db.insert(savedStories).values({ userId: user.id, storyId }).onConflictDoNothing();
  revalidatePath("/feed");
  return { ok: true, saved: deleted.length === 0 };
}

const MAX_INVITES_PER_DAY = 20;

/** Invite colleagues at the same company domain. Each invite is a new business contact at a known account. */
export async function inviteColleagues(_prev: ActionState, form: FormData): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "Please sign in again." };
  if (!current.companyDomain) return { error: "Colleague invites are available for work email accounts." };

  const raw = String(form.get("emails") ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const emails = [...new Set(raw)];
  if (emails.length === 0) return { error: "Enter at least one email address." };
  if (emails.length > 5) return { error: "You can invite up to 5 colleagues at a time." };
  const wrong = emails.filter((e) => classifyEmail(e) !== "work" || companyDomain(emailDomain(e)) !== current.companyDomain);
  if (wrong.length) return { error: `Only @${current.companyDomain} addresses can be invited: ${wrong.join(", ")}` };

  const [{ n: sentToday }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(engagementEvents)
    .where(and(eq(engagementEvents.userId, current.id), eq(engagementEvents.type, "colleague_invite"), gte(engagementEvents.createdAt, new Date(Date.now() - 864e5))));
  if (sentToday + emails.length > MAX_INVITES_PER_DAY) return { error: "You've reached today's invite limit. Try again tomorrow." };

  const existing = new Set(
    (await db.select({ email: user.email }).from(user).where(inArray(user.email, emails))).map((r) => r.email.toLowerCase()),
  );
  const toInvite = emails.filter((e) => !existing.has(e));
  for (const email of toInvite) {
    const url = `${appUrl()}/sign-up?ref=${encodeURIComponent(current.id)}&email=${encodeURIComponent(email)}&src=colleague_invite`;
    await sendEmail({
      to: email,
      subject: `${current.name} thinks you'd find ${BRAND} useful`,
      html: emailLayout({
        body: `<p style="font-size:15px">${escapeHtml(current.name)}${current.jobTitle ? ` (${escapeHtml(current.jobTitle)})` : ""} uses ${BRAND} to keep up with the AI news that matters to ${escapeHtml(current.company ?? "your company")} and invited you to join.</p>
<p style="font-size:14px;color:#334155">${BRAND} watches hundreds of sources and sends a short, personalized digest of model releases, pricing changes, regulation and enterprise adoption. It's free.</p>
<p><a href="${url}" style="display:inline-block;background:#12b393;color:#070b14;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Get my free radar</a></p>`,
        footer: `You received this because ${escapeHtml(current.name)} invited you. We won't email you again unless you sign up.`,
      }),
      text: `${current.name} invited you to ${BRAND}: ${url}`,
    });
    await track("colleague_invite", { userId: current.id, metadata: { email } });
  }
  revalidatePath("/feed");
  const parts = [];
  if (toInvite.length) parts.push(`Invited ${toInvite.length} colleague${toInvite.length === 1 ? "" : "s"}.`);
  if (existing.size) parts.push(`${existing.size} already ${existing.size === 1 ? "uses" : "use"} ${BRAND}.`);
  return { ok: true, message: parts.join(" ") };
}

/* ───────────────────────── Company stack (graph) ───────────────────────── */

async function stackActor() {
  const current = await getCurrentUser();
  if (!current?.companyDomain) throw new Error("Only work-email accounts have a company stack.");
  return { current, domain: current.companyDomain };
}

function revalidateStack() {
  revalidatePath("/feed");
  revalidatePath("/settings");
}

export async function confirmStackItem(form: FormData) {
  const { current, domain } = await stackActor();
  await setStackItemStatus(domain, String(form.get("entityId") ?? ""), "confirmed", current.id);
  revalidateStack();
}

export async function rejectStackItem(form: FormData) {
  const { current, domain } = await stackActor();
  await setStackItemStatus(domain, String(form.get("entityId") ?? ""), "rejected", current.id);
  revalidateStack();
}

export async function addStackItemAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { current, domain } = await stackActor();
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "Enter a tool or platform name." };
  const entity = await addStackItem(domain, name, current.id);
  if (!entity) return { error: "Couldn't add that tool." };
  revalidateStack();
  return { ok: true, message: `Added ${entity.name}.` };
}
