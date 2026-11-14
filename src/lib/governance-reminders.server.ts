import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { loadApprovers } from "@/app/(app)/w/[slug]/governance/data";
import { db } from "@/db";
import { initiatives, organizations } from "@/db/schema";
import { BRAND } from "./brand";
import { emailLayout, escapeHtml, sendEmail } from "./email";
import { appUrl } from "./env";
import { hasFeature } from "./plans";
import { reminderCount, selectReminders, type ReminderDigest } from "./governance-reminders";

function section(title: string, items: { id: string; title: string; days: number }[], describe: (days: number) => string, base: string) {
  if (!items.length) return "";
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;font-size:14px"><a href="${base}/initiatives/${i.id}#governance" style="color:#0f172a;font-weight:600;text-decoration:none">${escapeHtml(i.title)}</a> <span style="color:#64748b">· ${escapeHtml(describe(i.days))}</span></td></tr>`,
    )
    .join("");
  return `<h3 style="margin:18px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${escapeHtml(title)}</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function render(orgName: string, slug: string, d: ReminderDigest) {
  const base = `${appUrl()}/w/${slug}`;
  const n = reminderCount(d);
  const subject = `${n} AI governance item${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention in ${orgName}`;
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const body = `<h1 style="margin:0 0 8px;font-size:18px">Weekly governance reminder</h1>
<p style="margin:0;font-size:14px;line-height:1.5;color:#334155">Here's what needs a decision in the ${escapeHtml(orgName)} AI use-case register.</p>
${section("Review overdue", d.overdue, (k) => `overdue by ${plural(k, "day")}`, base)}
${section("Waiting for a decision", d.stalePending, (k) => `requested ${plural(k, "day")} ago`, base)}
${section("Review due soon", d.dueSoon, (k) => (k === 0 ? "due today" : `due in ${plural(k, "day")}`), base)}
<p style="margin:20px 0 0"><a href="${base}/governance" style="display:inline-block;background:#0b1220;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open the register</a></p>`;
  const text = [
    subject,
    ...d.overdue.map((i) => `Overdue (${i.days}d): ${i.title}`),
    ...d.stalePending.map((i) => `Waiting ${i.days}d: ${i.title}`),
    ...d.dueSoon.map((i) => `Due in ${i.days}d: ${i.title}`),
    `${base}/governance`,
  ].join("\n");
  return { subject, html: emailLayout({ preheader: subject, body, footer: `You're receiving this because you can approve AI governance reviews in ${escapeHtml(orgName)} on ${BRAND}.` }), text };
}

/** Weekly: email each workspace's approvers if any reviews are overdue, due soon, or waiting too long. */
export async function sendGovernanceReminders(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const orgs = await db.select().from(organizations).where(eq(organizations.status, "active"));
  const tally = { workspaces: orgs.length, notified: 0, emails: 0, failed: 0, skippedPlan: 0 };
  for (const org of orgs) {
    // Reminders are part of the approval workflow (Business and managed plans).
    if (!hasFeature(org.plan, "governance_workflow")) {
      tally.skippedPlan++;
      continue;
    }
    const rows = await db
      .select({
        id: initiatives.id,
        title: initiatives.title,
        stage: initiatives.stage,
        archivedAt: initiatives.archivedAt,
        approvalStatus: initiatives.approvalStatus,
        reviewDueOn: initiatives.reviewDueOn,
        approvalRequestedAt: initiatives.approvalRequestedAt,
      })
      .from(initiatives)
      .where(and(eq(initiatives.orgId, org.id), isNull(initiatives.archivedAt)));
    const digest = selectReminders(rows, today);
    if (reminderCount(digest) === 0) continue;
    const approvers = await loadApprovers(org.id);
    if (!approvers.length) continue;
    const msg = render(org.name, org.slug, digest);
    tally.notified++;
    for (const a of approvers) {
      const res = await sendEmail({ to: a.email, ...msg });
      if (res.status === "failed") tally.failed++;
      else tally.emails++;
    }
  }
  return tally;
}
