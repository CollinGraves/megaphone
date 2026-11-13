import { DIMENSIONS, LEVELS, bandFor, BAND_LABELS, type Band } from "@/lib/assessment";
import { cn } from "@/lib/utils";

const BAND_BAR: Record<Band, string> = {
  foundational: "bg-amber-500",
  developing: "bg-sky-600",
  strength: "bg-radar-500",
};
const BAND_TEXT: Record<Band, string> = {
  foundational: "text-amber-700",
  developing: "text-sky-700",
  strength: "text-radar-700",
};

/** Circular 0–100 gauge. */
export function ScoreRing({ score, size = 160, dark = false, label = "Overall readiness" }: { score: number; size?: number; dark?: boolean; label?: string }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${pct} out of 100`}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className={dark ? "stroke-white/10" : "stroke-slate-100"} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          className="stroke-radar-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("font-semibold tabular-nums tracking-tight", dark ? "text-white" : "text-slate-900")} style={{ fontSize: size * 0.28 }}>
          {pct}
        </span>
        <span className={cn("text-xs", dark ? "text-slate-400" : "text-slate-500")}>out of 100</span>
      </div>
    </div>
  );
}

/** The four maturity levels with the current one highlighted. */
export function LevelScale({ levelId, dark = false }: { levelId: string; dark?: boolean }) {
  const current = LEVELS.findIndex((l) => l.id === levelId);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Maturity levels">
      {LEVELS.map((l, i) => (
        <li key={l.id} aria-current={i === current ? "step" : undefined}>
          <div
            className={cn(
              "h-1.5 rounded-full",
              i <= current ? "bg-radar-500" : dark ? "bg-white/10" : "bg-slate-200",
              i === current && "ring-2 ring-radar-300/40",
            )}
          />
          <div
            className={cn(
              "mt-1.5 text-[10px] leading-tight sm:text-xs",
              i === current ? (dark ? "font-semibold text-white" : "font-semibold text-slate-900") : dark ? "text-slate-400" : "text-slate-500",
            )}
          >
            {l.label}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One horizontal bar per dimension, colored and labelled by band. */
export function DimensionBars({
  scores,
  showBand = true,
  notes,
  className,
}: {
  scores: Record<string, number>;
  showBand?: boolean;
  /** Optional one-line interpretation shown under each bar, keyed by dimension id. */
  notes?: Partial<Record<string, string>>;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-4", className)}>
      {DIMENSIONS.map((d) => {
        const score = Math.max(0, Math.min(100, Number(scores[d.id] ?? 0)));
        const band = bandFor(score);
        return (
          <li key={d.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-slate-800">{d.label}</span>
              <span className="flex items-baseline gap-2">
                {showBand ? <span className={cn("hidden text-xs font-medium sm:inline", BAND_TEXT[band])}>{BAND_LABELS[band]}</span> : null}
                <span className="font-semibold tabular-nums text-slate-900">{score}</span>
              </span>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
              role="meter"
              aria-label={d.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={score}
            >
              <div className={cn("h-full rounded-full", BAND_BAR[band])} style={{ width: `${Math.max(score, 2)}%` }} />
            </div>
            {notes?.[d.id] ? <p className="mt-1.5 text-sm text-slate-600">{notes[d.id]}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function BandLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500", className)}>
      {(["foundational", "developing", "strength"] as const).map((b) => (
        <span key={b} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", BAND_BAR[b])} aria-hidden />
          {BAND_LABELS[b]}
          <span className="text-slate-400">{b === "foundational" ? "0–39" : b === "developing" ? "40–69" : "70–100"}</span>
        </span>
      ))}
    </div>
  );
}
