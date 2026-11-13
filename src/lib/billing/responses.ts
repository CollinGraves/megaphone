import "server-only";
import { BRAND } from "@/lib/brand";
import { escapeHtml } from "@/lib/email";
import { FEATURE_LABELS, planForFeature, type Feature } from "@/lib/plans";
import type { WorkspaceContext } from "@/lib/workspace";

/**
 * Route-handler response when a download needs a feature the workspace's plan lacks: billing
 * managers are sent to Plan & billing; everyone else gets a small 402 page telling them who can upgrade.
 */
export function upgradeRequiredResponse(req: Request, ctx: WorkspaceContext, feature: Feature): Response {
  const base = `/w/${ctx.org.slug}`;
  if (ctx.can("billing:manage")) {
    return Response.redirect(new URL(`${base}/billing?upgrade=${feature}`, req.url), 303);
  }
  const plan = planForFeature(feature).name;
  const name = FEATURE_LABELS[feature].name;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)} · ${BRAND}</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0f172a">
<main style="max-width:32rem;margin:12vh auto;padding:0 16px">
<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#6d28d9">${escapeHtml(plan)} plan</p>
<h1 style="margin:0 0 8px;font-size:20px">${escapeHtml(name)} isn’t included in this workspace’s plan</h1>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#475569">${escapeHtml(ctx.org.name)} is on a plan without ${escapeHtml(name.toLowerCase())}. Ask a workspace owner or admin to upgrade to ${escapeHtml(plan)}.</p>
<a href="${base}" style="font-size:14px;font-weight:600;color:#0f172a">← Back to the workspace</a>
</div></main></body></html>`;
  return new Response(html, { status: 402, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
