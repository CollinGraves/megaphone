import { Flame } from "lucide-react";
import { Badge } from "@/components/ui";
import type { LeadScore, LeadStatus, LeadTier } from "@/lib/leads";
import { cn } from "@/lib/utils";

const STATUS_TONES = {
  new: "blue",
  contacted: "violet",
  qualified: "amber",
  customer: "radar",
  disqualified: "neutral",
} as const satisfies Record<LeadStatus, string>;

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  customer: "Customer",
  disqualified: "Disqualified",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
}

const TIER_STYLES: Record<LeadTier, string> = {
  hot: "bg-red-50 text-red-700 ring-red-200",
  warm: "bg-amber-50 text-amber-800 ring-amber-200",
  cold: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function ScoreBadge({ score, className }: { score: LeadScore; className?: string }) {
  const title = score.reasons.map((r) => `+${r.points} ${r.label}`).join("\n") || "No scoring signals yet";
  return (
    <span
      title={title}
      className={cn(
        "relative inline-flex min-w-12 items-center justify-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset",
        TIER_STYLES[score.tier],
        className,
      )}
    >
      {score.tier === "hot" ? <Flame className="size-3" aria-hidden /> : null}
      {score.score}
      <span className="sr-only"> ({score.tier})</span>
    </span>
  );
}

export function OrgStatusBadge({ status }: { status: "active" | "suspended" }) {
  return status === "active" ? <Badge tone="radar">Active</Badge> : <Badge tone="red">Suspended</Badge>;
}

export const PLAN_LABELS = {
  engagement: "Engagement",
  trial: "Trial",
  pro: "Pro",
  enterprise: "Enterprise",
} as const;

export function PlanBadge({ plan }: { plan: keyof typeof PLAN_LABELS }) {
  return <Badge tone={plan === "enterprise" ? "dark" : plan === "trial" ? "amber" : "neutral"}>{PLAN_LABELS[plan]}</Badge>;
}
