import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, type Initiative } from "@/db/schema";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { yesNo } from "@/lib/governance";
import { APPROVAL_STATUSES, HUMAN_OVERSIGHT_LEVELS, RISK_TIERS, SENSITIVITIES, labelFrom } from "@/lib/taxonomy";
import { formatDate } from "@/lib/utils";
import type { WorkspaceContext } from "@/lib/workspace";
import { loadApprovers } from "./data";
import { BRAND } from "@/lib/brand";

const button = (href: string, label: string) =>
  `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#0b1220;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">${escapeHtml(label)}</a></p>`;

const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:13px;color:#0f172a">${escapeHtml(value)}</td></tr>`;

const initiativeUrl = (ctx: WorkspaceContext, i: Initiative) => `${appUrl()}/w/${ctx.org.slug}/initiatives/${i.id}#governance`;

/** Tell approvers (owners, admins, assigned consultants — except the requester) that a review is waiting. */
export async function notifyReviewRequested(ctx: WorkspaceContext, i: Initiative, opts: { maxSensitivity: string | null; note: string | null }) {
  const approvers = (await loadApprovers(ctx.org.id)).filter((a) => a.id !== ctx.user.id);
  if (approvers.length === 0) return;
  const url = initiativeUrl(ctx, i);
  const subject = `Review requested: ${i.title}`;
  const body = `
<h1 style="margin:0 0 8px;font-size:18px">AI governance review requested</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5">${escapeHtml(ctx.user.name)} asked for a governance review of <strong>${escapeHtml(i.title)}</strong> in the ${escapeHtml(ctx.org.name)} workspace.</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${row("Risk tier", labelFrom(RISK_TIERS, i.riskTier))}
${row("Customer-facing", yesNo(i.customerFacing))}
${row("Affects individuals", yesNo(i.affectsIndividuals))}
${row("Human oversight", i.humanOversight ? labelFrom(HUMAN_OVERSIGHT_LEVELS, i.humanOversight) : "Not recorded")}
${row("Most sensitive data", opts.maxSensitivity ? labelFrom(SENSITIVITIES, opts.maxSensitivity) : "No data dependencies")}
</table>
${opts.note ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.5;border-left:3px solid #e2e8f0;padding-left:12px;color:#334155">${escapeHtml(opts.note)}</p>` : ""}
${button(url, "Review the initiative")}`;
  const text = `${ctx.user.name} asked for an AI governance review of "${i.title}" (${ctx.org.name}). Risk tier: ${labelFrom(RISK_TIERS, i.riskTier)}.${opts.note ? `\nNote: ${opts.note}` : ""}\nReview it: ${url}`;
  const footer = `You're receiving this because you can approve AI governance reviews in ${escapeHtml(ctx.org.name)} on ${BRAND}.`;
  await Promise.allSettled(
    approvers.map(async (a) => {
      const res = await sendEmail({ to: a.email, subject, html: emailLayout({ preheader: subject, body, footer }), text });
      if (res.status === "failed") console.error("[governance] review request email failed", a.email, res.error);
    }),
  );
}

/** Tell the requester about the decision. */
export async function notifyDecision(ctx: WorkspaceContext, i: Initiative, opts: { requesterId: string | null; decision: string; note: string | null; reviewDueOn: string | null }) {
  if (!opts.requesterId || opts.requesterId === ctx.user.id) return;
  const [requester] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, opts.requesterId)).limit(1);
  if (!requester) return;
  const url = initiativeUrl(ctx, i);
  const status = labelFrom(APPROVAL_STATUSES, opts.decision);
  const subject = `${status}: ${i.title}`;
  const noteLabel = opts.decision === "conditional" ? "Conditions" : opts.decision === "rejected" ? "Reason" : "Note";
  const body = `
<h1 style="margin:0 0 8px;font-size:18px">Governance review: ${escapeHtml(status.toLowerCase())}</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5">${escapeHtml(ctx.user.name)} reviewed <strong>${escapeHtml(i.title)}</strong> in ${escapeHtml(ctx.org.name)}.</p>
<table role="presentation" cellpadding="0" cellspacing="0">
${row("Decision", status)}
${opts.note ? row(noteLabel, opts.note) : ""}
${opts.reviewDueOn ? row("Next review due", formatDate(opts.reviewDueOn)) : ""}
</table>
${button(url, "Open the initiative")}`;
  const text = `${ctx.user.name} reviewed "${i.title}": ${status}.${opts.note ? `\n${noteLabel}: ${opts.note}` : ""}${opts.reviewDueOn ? `\nNext review due: ${formatDate(opts.reviewDueOn)}` : ""}\n${url}`;
  const res = await sendEmail({ to: requester.email, subject, html: emailLayout({ preheader: subject, body }), text });
  if (res.status === "failed") console.error("[governance] decision email failed", requester.email, res.error);
}
