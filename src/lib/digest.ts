import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { digests, memberships, organizations, user, userPreferences, type Story } from "@/db/schema";
import { loadOpenAlerts, type OpenAlert } from "@/app/(app)/w/[slug]/_lib/alerts";
import { emailLayout, escapeHtml, sendEmail } from "./email";
import { appUrl } from "./env";
import { daysUntil, deadlineLabel, upcomingDeadlines, type Deadline } from "./graph/personalize";
import { listStories } from "./stories";
import { categoryLabel, vendorLabel } from "./taxonomy";
import { usedByLabel, workspaceVendors } from "./workspace-news";
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
const MAX_ALERTS = 6;

type Prefs = Pick<typeof userPreferences.$inferSelect, "digestFrequency" | "lastDigestSentAt">;
type Recipient = { id: string; name: string; email: string };
type Workspace = { id: string; name: string; slug: string };

/**
 * Is this person's weekly email due at `now`? Mondays (UTC), at most once a week. "daily" is a
 * setting from the old personal news digest and now gets the weekly email too.
 */
export function isDigestDue(prefs: Prefs, now: Date): boolean {
  if (prefs.digestFrequency === "off") return false;
  const last = prefs.lastDigestSentAt?.getTime() ?? 0;
  return now.getUTCDay() === 1 && (now.getTime() - last) / 36e5 >= 24 * 6;
}

/** This week's news for a workspace: stories about its AI tools, new alerts, a few big stories. */
export async function selectWorkspaceDigest(ws: Workspace, sinceDays = 7) {
  const vendors = await workspaceVendors(ws.id);
  const usedBy = new Map(vendors.map((v) => [v.vendor, v.projects]));
  const since = new Date(Date.now() - sinceDays * 864e5);
  const [pool, alerts] = await Promise.all([
    vendors.length
      ? listStories({ vendors: vendors.map((v) => v.vendor), minImportance: 2, sinceDays, order: "top", limit: MAX_PERSONAL * 4 })
      : Promise.resolve([] as Story[]),
    loadOpenAlerts(ws.id, { limit: 50 }).then((rows) => rows.filter((a) => a.createdAt >= since).slice(0, MAX_ALERTS)),
  ]);
  const personal = diversify(pool, MAX_PERSONAL);
  const reasons = new Map<string, string>();
  for (const s of personal) {
    const v = s.vendors.find((x) => usedBy.has(x));
    if (v) reasons.set(s.id, `${vendorLabel(v)}: ${usedByLabel(usedBy.get(v)!)}`);
  }
  const seen = new Set(personal.map((s) => s.id));
  const also = (await listStories({ minImportance: 4, sinceDays, order: "top", limit: MAX_ALSO + MAX_PERSONAL })).filter((s) => !seen.has(s.id)).slice(0, MAX_ALSO);
  return { vendors: vendors.map((v) => v.vendor), personal, also, alerts, reasons };
}

function alertsBlock(alerts: OpenAlert[], ws: Workspace) {
  if (!alerts.length) return "";
  const rows = alerts
    .map(
      (a) => `<tr><td style="padding:6px 0;font-size:14px;color:#0f172a;line-height:1.45"><strong>${escapeHtml(a.initiativeTitle)}</strong>: <a href="${appUrl()}/news/${a.storySlug}" style="color:#0b7363">${escapeHtml(a.storyTitle)}</a></td></tr>`,
    )
    .join("");
  return `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #fecaca;background:#fef2f2;border-radius:10px">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#991b1b;font-weight:600">New alerts for your AI projects</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<a href="${appUrl()}/w/${ws.slug}/alerts" style="display:inline-block;margin-top:6px;font-size:13px;color:#0b7363">See all alerts →</a></div>`;
}

export function renderDigest(opts: {
  recipient: Recipient;
  workspace: Workspace;
  personal: Story[];
  also: Story[];
  alerts: OpenAlert[];
  digestId: string;
  reasons?: Map<string, string>;
  deadlines?: Deadline[];
}) {
  const ws = opts.workspace;
  const token = signUserToken(opts.recipient.id);
  const first = opts.recipient.name.split(" ")[0] || "there";
  const urgent = (opts.deadlines ?? []).find((d) => d.inStack && daysUntil(d.date) <= 14);
  const subject = urgent
    ? `Heads up: ${urgent.entityName} ${deadlineLabel(urgent.predicate)} in ${daysUntil(urgent.date)} days`
    : opts.alerts.length
      ? `${opts.alerts.length} new alert${opts.alerts.length === 1 ? "" : "s"} for ${ws.name}'s AI projects`
      : opts.personal[0]
        ? `This week for your AI tools: ${opts.personal[0].title}`
        : `What changed in AI this week`;
  const body = `<p style="margin:0 0 4px;font-size:15px">Hi ${escapeHtml(first)},</p>
<p style="margin:0 0 12px;font-size:15px;color:#334155">Here's what changed this week for the AI tools ${escapeHtml(ws.name)}'s projects use.</p>
${alertsBlock(opts.alerts, ws)}
${deadlinesBlock(opts.deadlines ?? [], ws.name)}
${opts.personal.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.personal.map((s) => storyBlock(s, token, opts.reasons?.get(s.id))).join("")}</table>` : `<p style="margin:0 0 12px;font-size:14px;color:#64748b">No news about your AI tools this week.</p>`}
${opts.also.length ? `<h3 style="margin:24px 0 0;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Also big this week</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.also.map((s) => storyBlock(s, token)).join("")}</table>` : ""}
<p style="margin:24px 0 0"><a href="${appUrl()}/w/${ws.slug}/news" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open ${escapeHtml(ws.name)} in ${BRAND}</a></p>
<img src="${appUrl()}/api/t/open?u=${encodeURIComponent(token)}&d=${opts.digestId}" width="1" height="1" alt="" style="display:block;border:0">`;
  const html = emailLayout({
    preheader: opts.alerts[0] ? `${opts.alerts[0].initiativeTitle}: ${opts.alerts[0].storyTitle}` : (opts.personal[0]?.summary ?? ""),
    body,
    footer: `You get this weekly email as a member of ${escapeHtml(ws.name)} on ${BRAND}. <a href="${appUrl()}/settings" style="color:#64748b">Change settings</a> · <a href="${appUrl()}/unsubscribe?u=${encodeURIComponent(token)}" style="color:#64748b">Unsubscribe</a>`,
  });
  const text = [
    `Hi ${first}, here's what changed this week for the AI tools ${ws.name}'s projects use.`,
    "",
    ...(opts.alerts.length ? ["New alerts:", ...opts.alerts.map((a) => `• ${a.initiativeTitle}: ${a.storyTitle}\n  ${appUrl()}/news/${a.storySlug}`), ""] : []),
    ...[...opts.personal, ...opts.also].map((s) => `• ${s.title}\n  ${s.summary}\n  ${appUrl()}/news/${s.slug}`),
    "",
    `Open ${ws.name}: ${appUrl()}/w/${ws.slug}/news`,
    `Unsubscribe: ${appUrl()}/unsubscribe?u=${token}`,
  ].join("\n");
  return { subject, html, text };
}

export async function sendDigestTo(recipient: Recipient, workspace: Workspace, prefs: Prefs, now = new Date()) {
  const sinceDays = prefs.lastDigestSentAt ? Math.min(7, Math.max(1, (now.getTime() - prefs.lastDigestSentAt.getTime()) / 864e5)) : 7;
  const { vendors, personal, also, alerts, reasons } = await selectWorkspaceDigest(workspace, sinceDays);
  const deadlines = vendors.length ? await upcomingDeadlines({ vendorSlugs: vendors, includeRegulation: true, days: 60, limit: 4 }) : [];
  const digestId = crypto.randomUUID();
  if (personal.length + alerts.length + deadlines.length === 0) {
    await db.insert(digests).values({ id: digestId, userId: recipient.id, storyIds: [], status: "skipped" });
    return "skipped" as const;
  }
  const { subject, html, text } = renderDigest({ recipient, workspace, personal, also, alerts, digestId, reasons, deadlines });
  const result = await sendEmail({ to: recipient.email, subject, html, text });
  await db.insert(digests).values({
    id: digestId,
    userId: recipient.id,
    storyIds: [...personal, ...also].map((s) => s.id),
    status: result.status,
    error: result.error ?? null,
  });
  if (result.status !== "failed") {
    await db
      .insert(userPreferences)
      .values({ userId: recipient.id, lastDigestSentAt: now })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { lastDigestSentAt: now } });
  }
  return result.status;
}

/** Weekly email for every workspace member (Mondays). Each person gets it for the workspace they joined most recently. */
export async function sendDueDigests(opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      digestFrequency: userPreferences.digestFrequency,
      lastDigestSentAt: userPreferences.lastDigestSentAt,
      wsId: organizations.id,
      wsName: organizations.name,
      wsSlug: organizations.slug,
    })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .innerJoin(organizations, and(eq(organizations.id, memberships.orgId), eq(organizations.status, "active")))
    .leftJoin(userPreferences, eq(userPreferences.userId, user.id))
    .orderBy(user.id, desc(memberships.createdAt));
  const tally = { considered: 0, sent: 0, logged: 0, skipped: 0, failed: 0, notDue: 0 };
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue; // one email per person
    seen.add(row.id);
    tally.considered++;
    const prefs: Prefs = { digestFrequency: row.digestFrequency ?? "weekly", lastDigestSentAt: row.lastDigestSentAt ?? null };
    if (prefs.digestFrequency === "off" || (!opts.force && !isDigestDue(prefs, now))) {
      tally.notDue++;
      continue;
    }
    const status = await sendDigestTo({ id: row.id, name: row.name, email: row.email }, { id: row.wsId, name: row.wsName, slug: row.wsSlug }, prefs, now);
    tally[status]++;
  }
  return tally;
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
      (d) => `<tr><td style="padding:6px 0;font-size:14px;color:#0f172a"><strong>${escapeHtml(d.entityName)}</strong> ${deadlineLabel(d.predicate)} in <strong>${daysUntil(d.date)} days</strong> <span style="color:#64748b">(${escapeHtml(d.date)}${d.inStack && companyName ? ` · ${escapeHtml(companyName)} uses this` : ""})</span>${d.storySlug ? ` · <a href="${appUrl()}/news/${d.storySlug}" style="color:#0b7363">details</a>` : ""}</td></tr>`,
    )
    .join("");
  return `<div style="margin:0 0 16px;padding:12px 14px;border:1px solid #fde68a;background:#fffbeb;border-radius:10px">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#92400e;font-weight:600">Upcoming deadlines</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></div>`;
}

