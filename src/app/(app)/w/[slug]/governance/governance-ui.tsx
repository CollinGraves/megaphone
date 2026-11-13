import { Badge } from "@/components/ui";
import type { ReviewState } from "@/lib/governance";
import { APPROVAL_STATUSES, HUMAN_OVERSIGHT_LEVELS, RISK_TIERS, labelFrom } from "@/lib/taxonomy";
import { cn, formatDate } from "@/lib/utils";

type Tone = "neutral" | "radar" | "blue" | "amber" | "red" | "violet" | "dark";

const TIER_TONES: Record<string, Tone> = { unclassified: "neutral", minimal: "radar", limited: "blue", high: "amber", prohibited: "red" };
export const TIER_BAR: Record<string, string> = {
  unclassified: "bg-slate-300",
  minimal: "bg-radar-500",
  limited: "bg-sky-500",
  high: "bg-amber-400",
  prohibited: "bg-red-500",
};

export function RiskTierBadge({ tier, className }: { tier: string; className?: string }) {
  return (
    <Badge tone={TIER_TONES[tier] ?? "neutral"} className={className} title={RISK_TIERS.find((t) => t.slug === tier)?.description}>
      {labelFrom(RISK_TIERS, tier)}
    </Badge>
  );
}

const APPROVAL_TONES: Record<string, Tone> = { not_submitted: "neutral", pending: "amber", approved: "radar", conditional: "blue", rejected: "red" };

export function ApprovalBadge({ status }: { status: string }) {
  return <Badge tone={APPROVAL_TONES[status] ?? "neutral"}>{labelFrom(APPROVAL_STATUSES, status)}</Badge>;
}

export function OversightText({ level }: { level: string | null }) {
  if (!level) return <span className="text-slate-400">Not recorded</span>;
  return <span className={level === "none" ? "text-amber-800" : undefined}>{labelFrom(HUMAN_OVERSIGHT_LEVELS, level)}</span>;
}

export function ReviewDue({ due, state }: { due: string | null; state: ReviewState }) {
  if (!due || state === "none") return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className={cn("whitespace-nowrap tabular-nums", state === "overdue" ? "font-medium text-red-700" : "text-slate-700")}>{formatDate(due)}</span>
      {state === "overdue" ? <Badge tone="red">Overdue</Badge> : state === "due_soon" ? <Badge tone="amber">Due soon</Badge> : null}
    </span>
  );
}

/** Subtle "not legal advice" note for governance surfaces. */
export function GovernanceDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-slate-500", className)}>
      Risk tiers and suggestions support your internal AI risk process and loosely follow categories used in frameworks such as the EU AI Act,
      NIST AI RMF and ISO/IEC 42001. They aren’t legal advice and don’t by themselves establish regulatory compliance.
    </p>
  );
}

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Human-readable governance activity (without the actor). */
export function describeGovernanceEvent(action: string, detail: Record<string, unknown> | null): string {
  const d = detail ?? {};
  switch (action) {
    case "governance.classified": {
      const changes = Array.isArray(d.changes) ? (d.changes as unknown[]).map(s).filter(Boolean) : [];
      return changes.length ? `updated the classification (${changes.join(", ")})` : "updated the classification";
    }
    case "governance.reopened":
      return `reopened the review: ${s(d.reason) || "the classification changed after a decision"}`;
    case "governance.review_requested":
      return "requested a governance review";
    case "governance.approved":
      return d.renewal ? "renewed the approval" : "approved";
    case "governance.approved_with_conditions":
      return d.renewal ? "renewed the approval with conditions" : "approved with conditions";
    case "governance.rejected":
      return "did not approve";
    case "governance.exported":
      return "exported the AI use-case inventory";
    case "governance.policy_updated":
      return "updated the governance policy";
    default:
      return action.replace(/^governance\./, "").replace(/[._]/g, " ");
  }
}
