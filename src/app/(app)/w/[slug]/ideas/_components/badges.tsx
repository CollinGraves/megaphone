import { Link2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui";
import { SIGNAL_LABELS, ideaSignal, type IdeaSizing, type IdeaUrgency } from "@/lib/ideas";
import { IDEA_STATUSES, IDEA_URGENCY, labelFrom } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "radar" | "blue" | "amber" | "red" | "violet" | "dark";

const STATUS_TONES: Record<string, Tone> = {
  new: "amber",
  under_review: "blue",
  accepted: "radar",
  declined: "neutral",
  duplicate: "violet",
};

export function IdeaStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "neutral"}>{labelFrom(IDEA_STATUSES, status)}</Badge>;
}

const URGENCY_TONES: Record<string, Tone> = { high: "red", medium: "neutral", low: "neutral" };

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <Badge tone={URGENCY_TONES[urgency] ?? "neutral"} className={urgency === "low" ? "text-slate-500" : undefined}>
      {labelFrom(IDEA_URGENCY, urgency)}
    </Badge>
  );
}

export function ChannelLabel({ channel, className }: { channel: string; className?: string }) {
  const viaLink = channel === "intake_link";
  return (
    <span className={cn("inline-flex items-center gap-1", className)} title={viaLink ? "Submitted through the shareable intake link" : "Submitted in the workspace"}>
      {viaLink ? <Link2 className="size-3.5" aria-hidden /> : <UserRound className="size-3.5" aria-hidden />}
      {viaLink ? "Intake link" : "In-app"}
    </span>
  );
}

const SIGNAL_BARS: Record<string, number> = { low: 1, medium: 2, high: 3 };

/** Three-bar "look at this first" indicator from urgency × hours × reach. */
export function SignalMeter({ idea, showLabel = false }: { idea: IdeaSizing & { urgency: IdeaUrgency }; showLabel?: boolean }) {
  const s = ideaSignal(idea);
  const bars = SIGNAL_BARS[s.level];
  const title = `${SIGNAL_LABELS[s.level]}${s.reasons.length ? `: ${s.reasons.join(", ")}` : ""}`;
  return (
    <span className="inline-flex items-center gap-1.5" title={title}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn("w-1 rounded-sm", i <= bars ? (s.level === "high" ? "bg-radar-500" : "bg-slate-500") : "bg-slate-200")}
            style={{ height: 4 + i * 3 }}
          />
        ))}
      </span>
      {showLabel ? <span className="text-xs text-slate-600">{SIGNAL_LABELS[s.level]}</span> : <span className="sr-only">{SIGNAL_LABELS[s.level]}</span>}
    </span>
  );
}
