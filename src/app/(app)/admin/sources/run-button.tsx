"use client";

import { useActionState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import type { IngestStats } from "@/lib/ingest/pipeline";
import { cn } from "@/lib/utils";
import type { RunState } from "./actions";

const STAT_LABELS: [keyof IngestStats, string][] = [
  ["sourcesFetched", "sources fetched"],
  ["sourcesFailed", "failed"],
  ["articlesAdded", "articles added"],
  ["articlesProcessed", "processed"],
  ["storiesCreated", "stories created"],
  ["storiesUpdated", "stories updated"],
  ["alertsCreated", "alerts"],
  ["llmBatches", "LLM batches"],
  ["llmFailures", "LLM failures"],
];

export function StatsSummary({ stats, className }: { stats: Partial<IngestStats>; className?: string }) {
  const parts = STAT_LABELS.filter(([k]) => (stats[k] ?? 0) > 0 || k === "articlesAdded" || k === "storiesCreated");
  return (
    <span className={cn("text-slate-600", className)}>
      {parts.map(([k, label], i) => (
        <span key={k}>
          {i > 0 ? " · " : null}
          <span className={cn("font-medium tabular-nums", (k === "sourcesFailed" || k === "llmFailures") && "text-red-700")}>
            {stats[k] ?? 0}
          </span>{" "}
          {label}
        </span>
      ))}
    </span>
  );
}

/** Button that runs an ingestion server action and shows the returned stats inline. */
export function RunButton({
  action,
  label,
  pendingLabel,
  variant = "secondary",
  compact = false,
}: {
  action: (prev: RunState) => Promise<RunState>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "accent";
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const Icon = compact ? RefreshCw : Play;
  return (
    <form action={formAction} className={cn("flex flex-col gap-2", compact ? "items-end" : "items-stretch sm:items-end")}>
      <Button type="submit" variant={variant} size={compact ? "sm" : "md"} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
        {pending ? pendingLabel : label}
      </Button>
      <div aria-live="polite">
        {state?.error ? (
          <Alert tone="error" className={compact ? "max-w-64 text-xs" : undefined}>
            {state.error}
          </Alert>
        ) : state?.stats ? (
          compact ? (
            <p className="max-w-64 text-right text-xs">
              <StatsSummary stats={state.stats} />
            </p>
          ) : (
            <Alert tone="success">
              Done in {((state.durationMs ?? 0) / 1000).toFixed(1)}s: <StatsSummary stats={state.stats} className="text-inherit" />
            </Alert>
          )
        ) : null}
      </div>
    </form>
  );
}
