import { csvCell, yesNo } from "@/lib/governance";
import { APPROVAL_STATUSES, BUILD_APPROACHES, HUMAN_OVERSIGHT_LEVELS, RISK_TIERS, SENSITIVITIES, STAGES, labelFrom } from "@/lib/taxonomy";
import { upgradeRequiredResponse } from "@/lib/billing/responses";
import { hasFeature } from "@/lib/plans";
import { ForbiddenError, logActivity, requireWorkspaceCapability } from "@/lib/workspace";
import { platformLabel } from "../../_components/badges";
import { filterRegister, loadRegister, parseRegisterFilters } from "../data";

export const dynamic = "force-dynamic";

const REVIEW_LABELS: Record<string, string> = { none: "", ok: "Current", due_soon: "Due within 30 days", overdue: "Overdue" };

/** "AI use-case inventory" for auditors: one row per (non-archived) initiative, honouring register filters. */
export async function GET(req: Request, { params }: RouteContext<"/w/[slug]/governance/export">) {
  const { slug } = await params;
  let ctx;
  try {
    ctx = await requireWorkspaceCapability(slug, "export");
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw err;
  }
  if (!hasFeature(ctx.org.plan, "governance_export")) return upgradeRequiredResponse(req, ctx, "governance_export");

  const { items, policy } = await loadRegister(ctx.org);
  const url = new URL(req.url);
  const filters = parseRegisterFilters(Object.fromEntries(url.searchParams));
  const rows = filterRegister(items, filters);
  const generatedAt = new Date().toISOString();

  const header = [
    "Use case ID", "Use case", "Business unit", "Owner", "Executive sponsor", "Stage", "Purpose (problem)", "Solution",
    "Platforms", "Models / products", "Build approach",
    "Risk tier", "Suggested tier", "Suggestion rationale", "Customer-facing", "Informs decisions about individuals", "Human oversight",
    "Most sensitive data", "Data sources (system: sensitivity)",
    "Approval status", "Review requested by", "Review requested at (UTC)", "Decided by", "Decided at (UTC)", "Conditions / decision notes",
    "Next review due", "Review status", "Open governance issues", "Governance notes",
    "Launched", "Created", "Last updated (UTC)", "Approval required before (policy)", "Review interval (months, policy)", "Generated at (UTC)",
  ];
  const lines = [header.map(csvCell).join(",")];
  const policyStages = policy.approvalRequiredStages.map((s) => labelFrom(STAGES, s)).join("; ") || "None";
  for (const i of rows) {
    lines.push(
      [
        i.id, i.title, i.businessUnit, i.ownerName, i.sponsor, labelFrom(STAGES, i.stage), i.problemStatement, i.proposedSolution,
        i.platforms.map(platformLabel).join("; "), i.models.join("; "), i.buildApproach ? labelFrom(BUILD_APPROACHES, i.buildApproach) : "",
        labelFrom(RISK_TIERS, i.riskTier),
        i.suggestion.tier === "unclassified" ? "" : labelFrom(RISK_TIERS, i.suggestion.tier),
        i.suggestion.explanation,
        yesNo(i.customerFacing), yesNo(i.affectsIndividuals),
        i.humanOversight ? labelFrom(HUMAN_OVERSIGHT_LEVELS, i.humanOversight) : "Not recorded",
        i.maxSensitivity ? labelFrom(SENSITIVITIES, i.maxSensitivity) : "None recorded",
        i.dataSources.map((d) => `${d.system}: ${labelFrom(SENSITIVITIES, d.sensitivity)}`).join("; "),
        labelFrom(APPROVAL_STATUSES, i.approvalStatus),
        // A reopened (not submitted) review keeps stale request/decision columns in the DB; don't export them as current.
        ...(i.approvalStatus === "not_submitted"
          ? ["", "", "", "", ""]
          : [i.requestedByName, i.approvalRequestedAt?.toISOString(), i.decidedByName, i.approvalDecidedAt?.toISOString(), i.approvalConditions]),
        i.reviewDueOn, REVIEW_LABELS[i.review], i.issues.map((x) => x.label).join("; "), i.governanceNotes,
        i.launchedAt, i.createdAt.toISOString().slice(0, 10), i.updatedAt.toISOString(), policyStages, policy.reviewIntervalMonths, generatedAt,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  await logActivity(ctx, "governance.exported", { rows: rows.length, filtered: rows.length !== items.length });
  const filename = `${ctx.org.slug}-ai-use-case-inventory-${generatedAt.slice(0, 10)}.csv`;
  // BOM so Excel opens UTF-8 correctly.
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
