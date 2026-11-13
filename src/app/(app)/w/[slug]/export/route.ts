import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dataDependencies, initiatives, systems } from "@/db/schema";
import { firstYearCost } from "@/lib/impact";
import { ACCESS_STATUSES, BUILD_APPROACHES, HEALTH, STAGES, labelFrom } from "@/lib/taxonomy";
import { ForbiddenError, logActivity, requireWorkspaceCapability } from "@/lib/workspace";
import { platformLabel } from "../_components/badges";
import { loadPortfolio } from "../_lib/portfolio";

export const dynamic = "force-dynamic";

/** Quote a CSV cell and neutralize spreadsheet formula injection. */
function cell(v: unknown): string {
  if (v == null) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "") : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: RouteContext<"/w/[slug]/export">) {
  const { slug } = await params;
  let ctx;
  try {
    ctx = await requireWorkspaceCapability(slug, "export");
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw err;
  }

  const [{ items }, deps] = await Promise.all([
    loadPortfolio(ctx.org),
    db
      .select({ initiativeId: dataDependencies.initiativeId, system: systems.name, accessStatus: dataDependencies.accessStatus })
      .from(dataDependencies)
      .innerJoin(initiatives, eq(dataDependencies.initiativeId, initiatives.id))
      .innerJoin(systems, eq(dataDependencies.systemId, systems.id))
      .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt))),
  ]);
  const depsBy = new Map<string, { system: string; accessStatus: string }[]>();
  for (const d of deps) depsBy.set(d.initiativeId, [...(depsBy.get(d.initiativeId) ?? []), d]);

  const header = [
    "Rank", "Priority score", "Rank override", "Title", "Stage", "Health", "Business unit", "Sponsor", "Owner",
    "Platforms", "Models", "Build approach", "Value (1-5)", "Feasibility (1-5)", "Alignment (1-5)", "Risk (1-5)",
    "Problem", "Solution", "Est. build cost (USD)", "Est. annual run cost (USD)", "First-year cost (USD)",
    "Est. annual value (USD)", "Actual annualized run-rate (USD)", "Realized last 12 months (USD)",
    "Est. hours saved / yr", "Actual hours saved / yr (run-rate)", "First-year ROI (%)", "Impact metrics",
    "Systems", "Blocked / pending access", "Target date", "Launched", "Tags", "Created", "Updated",
  ];
  const lines = [header.map(cell).join(",")];
  for (const i of items) {
    const d = depsBy.get(i.id) ?? [];
    const issues = d.filter((x) => x.accessStatus === "blocked" || x.accessStatus === "requested");
    lines.push(
      [
        i.rank, i.score, i.rankOverride, i.title, labelFrom(STAGES, i.stage), labelFrom(HEALTH, i.health), i.businessUnit, i.sponsor, i.ownerName,
        i.platforms.map(platformLabel).join("; "), i.models.join("; "), i.buildApproach ? labelFrom(BUILD_APPROACHES, i.buildApproach) : "",
        i.valueScore, i.feasibilityScore, i.alignmentScore, i.riskScore,
        i.problemStatement, i.proposedSolution, i.estimatedBuildCost, i.estimatedAnnualRunCost, firstYearCost(i),
        i.impact.hasEstimate ? i.impact.estimatedAnnualUsd : null,
        i.impact.hasActuals ? i.impact.actualRunRateUsd : null,
        i.impact.hasActuals ? i.impact.actualTrailing12Usd : null,
        i.impact.estimatedAnnualHours || null,
        i.impact.actualRunRateHours || null,
        i.roi != null ? i.roi * 100 : null,
        i.metricCount,
        [...new Set(d.map((x) => x.system))].join("; "),
        issues.map((x) => `${x.system} (${labelFrom(ACCESS_STATUSES, x.accessStatus)})`).join("; "),
        i.targetDate, i.launchedAt, i.tags.join("; "), i.createdAt.toISOString().slice(0, 10), i.updatedAt.toISOString().slice(0, 10),
      ]
        .map(cell)
        .join(","),
    );
  }

  await logActivity(ctx, "export.csv", { rows: items.length });
  const filename = `${ctx.org.slug}-ai-initiatives-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM so Excel opens UTF-8 correctly.
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
