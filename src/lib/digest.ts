import "server-only";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { digests, user, userPreferences, type Story } from "@/db/schema";
import { emailLayout, escapeHtml, sendEmail } from "./email";
import { appUrl } from "./env";
import { daysUntil, deadlineLabel, getStackContext, stackReasons, stackRelevance, upcomingDeadlines, type Deadline, type StackContext } from "./graph/personalize";
import { listStories } from "./stories";
import { categoryLabel, vendorLabel } from "./taxonomy";
import { signUserToken } from "./tracking";
import { BRAND } from "@/lib/brand";

const MAX_PERSONAL = 8;
const MAX_PER_VENDOR_OR_SOURCE = 2;

/**
 * Keep a digest varied: at most N stories per vendor and per source, preserving order.
 * Stories pinned by `prefer` (e.g. direct product matches) go first.
 */
export function diversify<T extends { id: string; vendors: string[]; primarySourceName: string | null }>(
  list: T[],
  limit: number,
  prefer: Set<string> = new Set(),
  cap = MAX_PER_VENDOR_OR_SOURCE,
): T[] {
  const ordered = [...list.filter((s) => prefer.has(s.id)), ...list.filter((s) => !prefer.has(s.id))];
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const s of ordered) {
    const keys = [`src:${s.primarySourceName ?? ""}`, ...(s.vendors[0] ? [`v:${s.vendors[0]}`] : [])];
    if (!prefer.has(s.id) && keys.some((k) => (counts.get(k) ?? 0) >= cap)) continue;
    keys.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
const MAX_ALSO = 3;

type Prefs = typeof userPreferences.$inferSelect;
type Recipient = { id: string; name: string; email: string; company?: string | null; companyDomain?: string | null };

/** Is this user's digest due at `now`? Daily = weekdays, weekly = Mondays (UTC). */
export function isDigestDue(prefs: Pick<Prefs, "digestFrequency" | "lastDigestSentAt">, now: Date): boolean {
  const day = now.getUTCDay();
  const last = prefs.lastDigestSentAt?.getTime() ?? 0;
  const hoursSince = (now.getTime() - last) / 36e5;
  if (prefs.digestFrequency === "daily") return day >= 1 && day <= 5 && hoursSince >= 20;
  if (prefs.digestFrequency === "weekly") return day === 1 && hoursSince >= 24 * 6;
  return false;
}

export async function selectDigestStories(prefs: Prefs, now = new Date(), stack: StackContext | null = null) {
  const windowDays = prefs.digestFrequency === "daily" ? 1.5 : 7;
  const sinceDays = prefs.lastDigestSentAt
    ? Math.min(windowDays, Math.max(1, (now.getTime() - prefs.lastDigestSentAt.getTime()) / 864e5))
    : windowDays;
  const pool = await listStories({
    categories: prefs.categories,
    vendors: prefs.vendors,
    industries: prefs.industries,
    matchAny: true,
    alsoMatch: stackRelevance(stack),
    minImportance: prefs.minImportance,
    sinceDays,
    order: "top",
    limit: MAX_PERSONAL * 4,
  });
  // Stories about a specific product/system in the company stack always make the cut.
  const direct = new Set<string>();
  if (stack) {
    const specificIds = stack.items.filter((i) => i.entity.kind !== "vendor").map((i) => i.entity.id);
    const reasons = await stackReasons(pool, { ...stack, items: stack.items.filter((i) => specificIds.includes(i.entity.id)), entityIds: specificIds, vendorSlugs: [] });
    for (const id of reasons.keys()) direct.add(id);
  }
  const personal = diversify(pool, MAX_PERSONAL, direct);
  // A couple of major stories outside the reader's interests, so nobody misses a big one.
  const seen = new Set(personal.map((s) => s.id));
  const also = (await listStories({ minImportance: 4, sinceDays, order: "top", limit: MAX_ALSO + MAX_PERSONAL }))
    .filter((s) => !seen.has(s.id))
    .slice(0, MAX_ALSO);
  return { personal, also };
}

function storyBlock(s: Story, token: string, reason?: string) {
  const href = `${appUrl()}/r/${s.id}?src=digest&u=${encodeURIComponent(token)}`;
  const tags = [...s.vendors.slice(0, 2).map(vendorLabel), ...s.categories.slice(0, 2).map(categoryLabel)].join(" · ");
  return `<tr><td style="padding:14px 0;border-bottom:1px solid #eef2f6">
${reason ? `<div style="display:inline-block;margin-bottom:4px;padding:2px 8px;border-radius:6px;background:#ecfdf8;color:#0e5b50;font-size:12px;font-weight:600">${escapeHtml(reason)}</div>` : ""}
<div style="font-size:12px;color:#64748b">${escapeHtml(s.primarySourceName ?? "")}${s.articleCount > 1 ? ` · ${s.articleCount} sources` : ""}${tags ? ` · ${escapeHtml(tags)}` : ""}</div>
<a href="${href}" style="display:block;margin-top:4px;font-size:16px;font-weight:600;color:#0f172a;text-decoration:none;line-height:1.35">${escapeHtml(s.title)}</a>
<div style="margin-top:6px;font-size:14px;line-height:1.5;color:#334155">${escapeHtml(s.summary)}</div>
${s.whyItMatters ? `<div style="margin-top:8px;padding-left:10px;border-left:3px solid #31ceab;font-size:13px;line-height:1.5;color:#334155"><strong>Why it matters:</strong> ${escapeHtml(s.whyItMatters)}</div>` : ""}
</td></tr>`;
}

function deadlinesBlock(deadlines: Deadline[], companyName?: string) {
  if (!deadlines.length) return "";
  const rows = deadlines
    .map(
      (d) => `<tr><td style="padding:6px 0;font-size:14px;color:#0f172a"><strong>${escapeHtml(d.entityName)}</strong> ${deadlineLabel(d.predicate)} in <strong>${daysUntil(d.date)} days</strong> <span style="color:#64748b">(${escapeHtml(d.date)}${d.inStack && companyName ? ` · ${escapeHtml(companyName)} uses this` : ""})</span>${d.storySlug ? ` · <a href="${appUrl()}/radar/${d.storySlug}" style="color:#0b7363">details</a>` : ""}</td></tr>`,
    )
    .join("");
  return `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #fde68a;background:#fffbeb;border-radius:10px">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#92400e;font-weight:600">Upcoming deadlines</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></div>`;
}

export function renderDigest(opts: {
  recipient: Recipient;
  frequency: "daily" | "weekly";
  personal: Story[];
  also: Story[];
  digestId: string;
  reasons?: Map<string, string>;
  deadlines?: Deadline[];
  companyName?: string;
}) {
  const token = signUserToken(opts.recipient.id);
  const first = opts.recipient.name.split(" ")[0] || "there";
  const period = opts.frequency === "daily" ? "today" : "this week";
  const urgent = (opts.deadlines ?? []).find((d) => d.inStack && daysUntil(d.date) <= 14);
  const subject = urgent
    ? `Heads up: ${urgent.entityName} ${deadlineLabel(urgent.predicate)} in ${daysUntil(urgent.date)} days`
    : opts.personal[0] != null
      ? `${opts.personal[0].title}${opts.personal.length + opts.also.length > 1 ? ` + ${opts.personal.length + opts.also.length - 1} more` : ""}`
      : `Your ${BRAND} for ${period}`;
  const body = `<p style="margin:0 0 4px;font-size:15px">Hi ${escapeHtml(first)},</p>
<p style="margin:0 0 12px;font-size:15px;color:#334155">Here's what mattered in AI ${period}, filtered to your interests.</p>
${deadlinesBlock(opts.deadlines ?? [], opts.companyName)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.personal.map((s) => storyBlock(s, token, opts.reasons?.get(s.id))).join("")}</table>
${opts.also.length ? `<h3 style="margin:24px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Also big ${period}</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.also.map((s) => storyBlock(s, token)).join("")}</table>` : ""}
<div style="margin-top:24px;padding:16px;border-radius:10px;background:#0b1220;color:#e2e8f0;font-size:14px;line-height:1.5">
<strong style="color:#ffffff">Is your company keeping up?</strong> North Labs helps teams prioritize, build and measure AI initiatives on any platform.
<a href="${appUrl()}/contact?from=digest" style="color:#6ce5c6">Talk to us →</a></div>
<img src="${appUrl()}/api/t/open?u=${encodeURIComponent(token)}&d=${opts.digestId}" width="1" height="1" alt="" style="display:block;border:0">`;
  const html = emailLayout({
    preheader: opts.personal[0]?.summary ?? "",
    body,
    footer: `You're receiving the ${opts.frequency} ${BRAND} digest. <a href="${appUrl()}/settings" style="color:#64748b">Change preferences</a> · <a href="${appUrl()}/unsubscribe?u=${encodeURIComponent(token)}" style="color:#64748b">Unsubscribe</a>`,
  });
  const text = [
    `Hi ${first}, here's what mattered in AI ${period}:`,
    "",
    ...[...opts.personal, ...opts.also].map((s) => `• ${s.title}\n  ${s.summary}\n  ${appUrl()}/radar/${s.slug}`),
    "",
    `Unsubscribe: ${appUrl()}/unsubscribe?u=${token}`,
  ].join("\n");
  return { subject, html, text };
}

export async function sendDigestTo(recipient: Recipient, prefs: Prefs, now = new Date()) {
  const frequency = prefs.digestFrequency === "daily" ? "daily" : "weekly";
  const stack = await getStackContext({ companyDomain: recipient.companyDomain ?? null, company: recipient.company ?? null });
  const { personal, also } = await selectDigestStories(prefs, now, stack);
  const digestId = crypto.randomUUID();
  const [reasons, deadlines] = await Promise.all([
    stackReasons(personal, stack),
    upcomingDeadlines({
      entityIds: stack?.entityIds,
      vendorSlugs: [...new Set([...(stack?.vendorSlugs ?? []), ...prefs.vendors])],
      includeRegulation: prefs.categories.includes("regulation"),
      days: 60,
      limit: 4,
    }),
  ]);
  if (personal.length + also.length + deadlines.length === 0) {
    await db.insert(digests).values({ id: digestId, userId: recipient.id, storyIds: [], status: "skipped" });
    return "skipped" as const;
  }
  const { subject, html, text } = renderDigest({
    recipient,
    frequency,
    personal,
    also,
    digestId,
    reasons,
    deadlines,
    companyName: stack?.companyName,
  });
  const result = await sendEmail({ to: recipient.email, subject, html, text });
  await db.insert(digests).values({
    id: digestId,
    userId: recipient.id,
    storyIds: [...personal, ...also].map((s) => s.id),
    status: result.status,
    error: result.error ?? null,
  });
  if (result.status !== "failed") {
    await db.update(userPreferences).set({ lastDigestSentAt: now }).where(eq(userPreferences.userId, recipient.id));
  }
  return result.status;
}

export async function sendDueDigests(opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const rows = await db
    .select({ prefs: userPreferences, id: user.id, name: user.name, email: user.email, company: user.company, companyDomain: user.companyDomain })
    .from(userPreferences)
    .innerJoin(user, eq(user.id, userPreferences.userId))
    .where(and(ne(userPreferences.digestFrequency, "off"), isNotNull(user.onboardedAt)));
  const tally = { considered: rows.length, sent: 0, logged: 0, skipped: 0, failed: 0, notDue: 0 };
  for (const row of rows) {
    if (!opts.force && !isDigestDue(row.prefs, now)) {
      tally.notDue++;
      continue;
    }
    const status = await sendDigestTo(
      { id: row.id, name: row.name, email: row.email, company: row.company, companyDomain: row.companyDomain },
      row.prefs,
      now,
    );
    tally[status]++;
  }
  return tally;
}
