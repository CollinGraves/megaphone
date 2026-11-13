import type { GovernancePolicy } from "@/db/schema";
import { APPROVAL_STATUSES, HUMAN_OVERSIGHT_LEVELS, RISK_TIERS, SENSITIVITIES, STAGES, labelFrom } from "./taxonomy";
import { formatDate } from "./utils";

/*
 * Pure AI-governance rules: risk-tier suggestions, data sensitivity, the stage gate, review dates and
 * "needs attention" checks. These are a structured aid for a company's own risk process (loosely
 * modelled on the categories used by frameworks such as the EU AI Act and NIST AI RMF). They are not
 * legal advice and don't by themselves establish compliance with any regulation.
 */

export type RiskTier = (typeof RISK_TIERS)[number]["slug"];
export type OversightLevel = (typeof HUMAN_OVERSIGHT_LEVELS)[number]["slug"];
export type Sensitivity = (typeof SENSITIVITIES)[number]["slug"];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]["slug"];
export type Stage = (typeof STAGES)[number]["slug"];

export const DEFAULT_GOVERNANCE_POLICY: GovernancePolicy = { approvalRequiredStages: [], reviewIntervalMonths: 12 };
export const REVIEW_INTERVAL_OPTIONS = [6, 12, 24] as const;
export const GATEABLE_STAGES = ["pilot", "production"] as const;
/** Stages where an AI system is in front of real users or real data. */
export const LIVE_STAGES: readonly string[] = ["pilot", "production"];
/** A pending review older than this is flagged. */
export const PENDING_STALE_DAYS = 14;
/** Approvals whose review is due within this many days are "due soon". */
export const REVIEW_DUE_SOON_DAYS = 30;

/** Normalize whatever is stored in organizations.governance_policy. */
export function normalizePolicy(p: Partial<GovernancePolicy> | null | undefined): GovernancePolicy {
  const stages = Array.isArray(p?.approvalRequiredStages)
    ? GATEABLE_STAGES.filter((s) => p!.approvalRequiredStages!.includes(s))
    : [];
  const months = Number(p?.reviewIntervalMonths);
  return {
    approvalRequiredStages: stages,
    reviewIntervalMonths: Number.isFinite(months) && months >= 1 && months <= 60 ? Math.round(months) : DEFAULT_GOVERNANCE_POLICY.reviewIntervalMonths,
  };
}

/* ───────────────────────────── Data sensitivity ───────────────────────────── */

/** Least → most sensitive. Health data ranks highest (special-category data almost everywhere). */
const SENSITIVITY_ORDER: Sensitivity[] = ["public", "internal", "confidential", "pii", "pci", "phi"];
export const REGULATED_SENSITIVITIES: readonly Sensitivity[] = ["pii", "pci", "phi"];

export const sensitivityRank = (s: string | null | undefined) => (s ? SENSITIVITY_ORDER.indexOf(s as Sensitivity) : -1);
export const isRegulatedData = (s: string | null | undefined) => REGULATED_SENSITIVITIES.includes(s as Sensitivity);

/** The most sensitive data class across an initiative's dependencies, or null when it has none. */
export function maxSensitivity(values: readonly (string | null | undefined)[]): Sensitivity | null {
  let best: Sensitivity | null = null;
  for (const v of values) if (sensitivityRank(v) > sensitivityRank(best)) best = v as Sensitivity;
  return best;
}

/* ───────────────────────────── Risk-tier suggestion ───────────────────────────── */

const TIER_ORDER: RiskTier[] = ["unclassified", "minimal", "limited", "high", "prohibited"];
export const tierRank = (t: string | null | undefined) => TIER_ORDER.indexOf((t ?? "unclassified") as RiskTier);

export type TierInputs = {
  customerFacing: boolean | null;
  affectsIndividuals: boolean | null;
  maxSensitivity: string | null;
  humanOversight: string | null;
};

export type TierSuggestion = {
  /** "unclassified" when there isn't enough information to suggest anything. */
  tier: RiskTier;
  /** Why the tier was suggested, most important first. */
  reasons: string[];
  /** Questions that are still unanswered (answering them could raise the tier). */
  missing: string[];
  explanation: string;
};

/**
 * Suggest a risk tier from the classification answers. Monotonic: each fact can only raise the tier.
 *  - High: informs decisions about individuals, or processes regulated data (PII/PHI/PCI) fully automated.
 *  - Limited: customer-facing, or processes regulated data (with people in the loop).
 *  - Minimal: internal, no decisions about people, no regulated data — and every question answered.
 *  - Prohibited is never suggested: it reflects company policy or regulation, so a person sets it.
 */
export function suggestRiskTier(input: TierInputs): TierSuggestion {
  const reasons: string[] = [];
  const missing: string[] = [];
  let tier = "minimal" as RiskTier;
  const raise = (t: RiskTier, reason: string) => {
    if (tierRank(t) > tierRank(tier)) tier = t;
    reasons.push(reason);
  };
  const regulated = isRegulatedData(input.maxSensitivity);
  const dataLabel = labelFrom(SENSITIVITIES, input.maxSensitivity);

  if (input.affectsIndividuals === true)
    raise("high", "it makes or informs decisions about individuals (e.g. hiring, credit, health, education or benefits)");
  if (regulated && input.humanOversight === "none") raise("high", `it processes ${dataLabel} data with no human review of outputs`);
  if (input.customerFacing === true) raise("limited", "customers interact with it or see its output, so they should be told AI is involved");
  if (regulated && input.humanOversight !== "none") raise("limited", `it processes ${dataLabel} data`);

  if (input.affectsIndividuals == null) missing.push("whether it informs decisions about individuals");
  if (input.customerFacing == null) missing.push("whether it is customer-facing");
  if (regulated && input.humanOversight == null) missing.push("the level of human oversight");

  // Nothing raised it, but unanswered questions could: don't guess "minimal".
  if (tier === "minimal" && missing.length > 0) {
    return {
      tier: "unclassified",
      reasons: [],
      missing,
      explanation: `Answer ${joinList(missing)} to get a suggested tier.`,
    };
  }
  if (tier === "minimal") reasons.push("it is internal, doesn't inform decisions about people and uses no personal, health or payment data");

  const label = labelFrom(RISK_TIERS, tier);
  let explanation = `${label} because ${joinList(reasons)}.`;
  if (missing.length > 0 && tier !== "high") explanation += ` Still unanswered: ${joinList(missing)}.`;
  return { tier, reasons, missing, explanation: capitalize(explanation) };
}

/* ───────────────────────────── Approvals & the stage gate ───────────────────────────── */

export const isApproved = (status: string | null | undefined) => status === "approved" || status === "conditional";

/** Does the workspace policy require an approved review before entering `stage`? */
export const stageRequiresApproval = (policy: Pick<GovernancePolicy, "approvalRequiredStages">, stage: string) =>
  (policy.approvalRequiredStages as readonly string[]).includes(stage);

/** "YYYY-MM-DD" (UTC) for a date. */
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Approved (or approved with conditions) and the periodic review isn't overdue. */
export function approvalInForce(i: { approvalStatus: string; reviewDueOn: string | null }, today: string): boolean {
  return isApproved(i.approvalStatus) && (!i.reviewDueOn || i.reviewDueOn >= today);
}

/**
 * Why moving an initiative into `toStage` is blocked by policy, or null when it's allowed.
 * Only *entering* a gated stage is checked: initiatives already there (e.g. live before the policy
 * existed) can still be edited, and show up in "needs attention" instead.
 */
export function stageChangeBlocked(input: {
  policy: Pick<GovernancePolicy, "approvalRequiredStages">;
  fromStage: string | null;
  toStage: string;
  approvalStatus: string;
  reviewDueOn: string | null;
  today: string;
}): string | null {
  const { policy, fromStage, toStage } = input;
  if (fromStage === toStage || !stageRequiresApproval(policy, toStage)) return null;
  const stageLabel = labelFrom(STAGES, toStage);
  const required = `Workspace policy requires an approved AI governance review before an initiative moves to ${stageLabel}.`;
  if (fromStage == null) return `${required} Create it in an earlier stage, classify it and request a review first.`;
  if (approvalInForce(input, input.today)) return null;
  switch (input.approvalStatus) {
    case "pending":
      return `${required} Its review is still pending — an owner or admin needs to approve it first.`;
    case "rejected":
      return `${required} Its last review was not approved. Update the classification and request a new review.`;
    case "approved":
    case "conditional":
      return `${required} Its approval lapsed (review was due ${formatDate(input.reviewDueOn)}). Request a re-review first.`;
    default:
      return `${required} Classify it in the governance section and request a review first.`;
  }
}

/** Review due date: `months` after the decision date, clamped to the end of shorter months. */
export function computeReviewDue(decidedAt: Date, months: number): string {
  const y = decidedAt.getUTCFullYear();
  const m = decidedAt.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(decidedAt.getUTCDate(), lastDay));
  return isoDate(target);
}

export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

export type ReviewState = "none" | "ok" | "due_soon" | "overdue";

/** Where an approval's periodic review stands. Only approved / conditional initiatives have one. */
export function reviewState(i: { approvalStatus: string; reviewDueOn: string | null }, today: string): ReviewState {
  if (!isApproved(i.approvalStatus) || !i.reviewDueOn) return "none";
  const days = daysBetween(today, i.reviewDueOn);
  if (days < 0) return "overdue";
  return days <= REVIEW_DUE_SOON_DAYS ? "due_soon" : "ok";
}

/** Who may request a review right now (status-wise). */
export function canRequestReview(i: { approvalStatus: string; reviewDueOn: string | null }, today: string): boolean {
  if (i.approvalStatus === "not_submitted" || i.approvalStatus === "rejected") return true;
  const rs = reviewState(i, today);
  return rs === "due_soon" || rs === "overdue";
}

/** Approvers decide pending reviews, and can renew an existing approval (a re-review). */
export const canDecide = (status: string) => status === "pending" || isApproved(status);

/** Classification fields whose change invalidates a past decision. */
export const MATERIAL_FIELDS = ["riskTier", "customerFacing", "affectsIndividuals", "humanOversight"] as const;

export function materialChanges(
  before: Record<(typeof MATERIAL_FIELDS)[number], unknown>,
  after: Record<(typeof MATERIAL_FIELDS)[number], unknown>,
): (typeof MATERIAL_FIELDS)[number][] {
  return MATERIAL_FIELDS.filter((k) => (before[k] ?? null) !== (after[k] ?? null));
}

/** After a material change, approved / conditional / rejected decisions no longer apply. */
export const decisionReopenedBy = (status: string, changed: readonly string[]) =>
  changed.length > 0 && (isApproved(status) || status === "rejected");

/* ───────────────────────────── Needs attention ───────────────────────────── */

export type GovernanceIssueCode =
  | "prohibited_active"
  | "unapproved_in_gated_stage"
  | "rejected_but_live"
  | "high_risk_no_oversight"
  | "unclassified_live"
  | "review_overdue"
  | "pending_stale"
  | "under_classified";

export type GovernanceIssue = { code: GovernanceIssueCode; severity: "high" | "medium"; label: string };

export type GovernanceSubject = {
  stage: string;
  riskTier: string;
  customerFacing: boolean | null;
  affectsIndividuals: boolean | null;
  humanOversight: string | null;
  approvalStatus: string;
  approvalRequestedAt: Date | null;
  reviewDueOn: string | null;
  archivedAt?: Date | null;
};

/** Governance problems with an initiative, most severe first. Retired and archived initiatives have none. */
export function governanceIssues(
  i: GovernanceSubject,
  opts: { policy: Pick<GovernancePolicy, "approvalRequiredStages">; today: string; maxSensitivity: string | null; pendingStaleDays?: number },
): GovernanceIssue[] {
  if (i.stage === "retired" || i.archivedAt) return [];
  const out: GovernanceIssue[] = [];
  const live = LIVE_STAGES.includes(i.stage);
  const stageLabel = labelFrom(STAGES, i.stage);

  if (i.riskTier === "prohibited") out.push({ code: "prohibited_active", severity: "high", label: "Classified as prohibited but still active" });
  if (stageRequiresApproval(opts.policy, i.stage) && !approvalInForce(i, opts.today) && i.approvalStatus !== "rejected")
    out.push({ code: "unapproved_in_gated_stage", severity: "high", label: `In ${stageLabel} without the approval policy requires` });
  if (live && i.approvalStatus === "rejected") out.push({ code: "rejected_but_live", severity: "high", label: `In ${stageLabel} although its review was not approved` });
  if (i.riskTier === "high" && (i.humanOversight == null || i.humanOversight === "none"))
    out.push({
      code: "high_risk_no_oversight",
      severity: "high",
      label: i.humanOversight == null ? "High risk with no human oversight recorded" : "High risk and fully automated",
    });
  if (live && i.riskTier === "unclassified") out.push({ code: "unclassified_live", severity: "medium", label: `Unclassified but already in ${stageLabel}` });
  if (reviewState(i, opts.today) === "overdue") out.push({ code: "review_overdue", severity: "medium", label: `Periodic review overdue since ${formatDate(i.reviewDueOn)}` });
  if (i.approvalStatus === "pending" && i.approvalRequestedAt) {
    const days = daysBetween(isoDate(i.approvalRequestedAt), opts.today);
    if (days > (opts.pendingStaleDays ?? PENDING_STALE_DAYS)) out.push({ code: "pending_stale", severity: "medium", label: `Review pending for ${days} days` });
  }
  if (i.riskTier !== "unclassified" && i.riskTier !== "prohibited") {
    const s = suggestRiskTier({ ...i, maxSensitivity: opts.maxSensitivity });
    if (tierRank(s.tier) > tierRank(i.riskTier))
      out.push({ code: "under_classified", severity: "medium", label: `Classified ${labelFrom(RISK_TIERS, i.riskTier).toLowerCase()}, but its answers suggest ${labelFrom(RISK_TIERS, s.tier).toLowerCase()}` });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

/* ───────────────────────────── CSV ───────────────────────────── */

/** Quote a CSV cell and neutralize spreadsheet formula injection (same rules as the portfolio export). */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ───────────────────────────── Text helpers ───────────────────────────── */

export const yesNo = (v: boolean | null | undefined, unknown = "Not answered") => (v == null ? unknown : v ? "Yes" : "No");

function joinList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join("; ")}; and ${items[items.length - 1]}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
