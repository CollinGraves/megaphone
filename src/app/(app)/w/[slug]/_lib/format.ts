import { formatNumber, formatUsd } from "@/lib/utils";

export function formatPct(ratio: number | null | undefined, digits = 0) {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Value in a metric's native unit. */
export function formatMetricValue(value: number | null | undefined, unit: string, compact = true) {
  if (value == null) return "—";
  const u = unit.trim().toLowerCase();
  if (u === "usd" || u === "$") return formatUsd(value, compact);
  if (u === "hours" || u === "hrs" || u === "h") return `${formatNumber(value, compact)} h`;
  return `${formatNumber(value, compact)}${unit ? ` ${unit}` : ""}`;
}

/** "Oct 2026" from an ISO date. */
export function formatMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
