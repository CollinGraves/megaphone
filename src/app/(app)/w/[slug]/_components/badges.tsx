import { Badge } from "@/components/ui";
import { ACCESS_STATUSES, HEALTH, SENSITIVITIES, STAGES, VENDORS, labelFrom, vendorLabel } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "radar" | "blue" | "amber" | "red" | "violet" | "dark";

const STAGE_TONES: Record<string, Tone> = {
  idea: "neutral",
  evaluating: "violet",
  building: "blue",
  pilot: "amber",
  production: "radar",
  retired: "neutral",
};
export const STAGE_BAR: Record<string, string> = {
  idea: "bg-slate-300",
  evaluating: "bg-violet-400",
  building: "bg-sky-500",
  pilot: "bg-amber-400",
  production: "bg-radar-500",
  retired: "bg-slate-200",
};

export function StageBadge({ stage }: { stage: string }) {
  return (
    <Badge tone={STAGE_TONES[stage] ?? "neutral"} className={stage === "retired" ? "line-through decoration-slate-400" : undefined}>
      {labelFrom(STAGES, stage)}
    </Badge>
  );
}

const HEALTH_STYLES: Record<string, { tone: Tone; dot: string }> = {
  on_track: { tone: "radar", dot: "bg-radar-500" },
  at_risk: { tone: "amber", dot: "bg-amber-500" },
  blocked: { tone: "red", dot: "bg-red-500" },
};

export function HealthBadge({ health }: { health: string }) {
  const s = HEALTH_STYLES[health] ?? HEALTH_STYLES.on_track;
  return (
    <Badge tone={s.tone}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {labelFrom(HEALTH, health)}
    </Badge>
  );
}

const ACCESS_TONES: Record<string, Tone> = { not_requested: "neutral", requested: "amber", granted: "radar", blocked: "red" };
export function AccessBadge({ status }: { status: string }) {
  return <Badge tone={ACCESS_TONES[status] ?? "neutral"}>{labelFrom(ACCESS_STATUSES, status)}</Badge>;
}

const SENSITIVE = new Set(["pii", "phi", "pci"]);
export function SensitivityBadge({ sensitivity }: { sensitivity: string }) {
  return (
    <Badge tone={SENSITIVE.has(sensitivity) ? "violet" : sensitivity === "confidential" ? "blue" : "neutral"}>
      {labelFrom(SENSITIVITIES, sensitivity)}
    </Badge>
  );
}

/** Vendor slugs plus workspace-only platform options. */
export const PLATFORM_OPTIONS: { slug: string; label: string }[] = [
  ...VENDORS,
  { slug: "in_house", label: "In-house / open model" },
  { slug: "other", label: "Other" },
];

export function platformLabel(slug: string) {
  return PLATFORM_OPTIONS.find((p) => p.slug === slug)?.label ?? vendorLabel(slug);
}

export function PlatformList({ platforms, className }: { platforms: string[]; className?: string }) {
  if (platforms.length === 0) return <span className="text-slate-400">—</span>;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {platforms.map((p) => (
        <span key={p} className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700">
          {platformLabel(p)}
        </span>
      ))}
    </div>
  );
}

/** Small 0–100 score pill. */
export function ScorePill({ score, className }: { score: number; className?: string }) {
  const tone = score >= 70 ? "bg-radar-500" : score >= 50 ? "bg-sky-500" : score >= 35 ? "bg-amber-400" : "bg-slate-300";
  return (
    <span className={cn("inline-flex items-center gap-2 tabular-nums", className)} title={`Priority score ${score} / 100`}>
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <span className={cn("absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </span>
      <span className="text-sm font-medium text-slate-900">{Math.round(score)}</span>
    </span>
  );
}
