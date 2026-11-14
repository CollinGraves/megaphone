import { Download, Lock } from "lucide-react";
import { ButtonLink, buttonClass } from "@/components/ui";
import { hasFeature, planForFeature } from "@/lib/plans";
import type { WorkspaceContext } from "@/lib/workspace";

/**
 * "Export CSV" in page headers. On plans without CSV export it never looks like a working download:
 * billing managers get a link to plans, everyone else a disabled button that names the plan needed.
 */
export function ExportCsvButton({ ctx }: { ctx: WorkspaceContext }) {
  if (!ctx.can("export")) return null;
  const base = `/w/${ctx.org.slug}`;
  if (hasFeature(ctx.org.plan, "export_csv")) {
    return (
      <ButtonLink href={`${base}/export`} variant="secondary" prefetch={false}>
        <Download className="size-4" /> Export CSV
      </ButtonLink>
    );
  }
  const plan = planForFeature("export_csv").name;
  const hint = `CSV export is available on the ${plan} plan and up.`;
  if (ctx.can("billing:manage")) {
    return (
      <ButtonLink href={`${base}/billing?upgrade=export_csv`} variant="secondary" title={`${hint} See plans.`} aria-label={`Export CSV (${plan} plan) – see plans`}>
        <Lock className="size-4 text-slate-400" /> Export CSV
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{plan}</span>
      </ButtonLink>
    );
  }
  return (
    // A wrapper carries the tooltip: disabled buttons don't fire hover events in every browser.
    <span title={hint} className="inline-flex">
      <button type="button" disabled aria-disabled className={buttonClass("secondary")} aria-label={`Export CSV – ${hint}`}>
        <Lock className="size-4" /> Export CSV
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{plan}</span>
      </button>
    </span>
  );
}
