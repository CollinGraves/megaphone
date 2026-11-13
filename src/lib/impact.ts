/**
 * Business-impact math for workspace initiatives. Pure functions — no DB access.
 *
 * Conventions
 * - Estimates are entered per metric period: `monthly` values are ×12, `annual` values count as-is,
 *   and `one_time` values count once (they are attributed to the first year).
 * - Dollar conversion: `hours_saved` uses `metric.hourlyRate ?? org.defaultHourlyRate`;
 *   `cost_saved` / `revenue_generated` are already USD; `custom` metrics only count as dollars when
 *   their unit is USD — otherwise they are tracked but excluded from dollar rollups.
 * - Actuals come from measurements (one per metric period, keyed by `periodStart`). Two views:
 *   - **Trailing 12 months** (realized): sum of measurements whose period starts in the 12 calendar
 *     months ending with the `asOf` month. For `one_time` metrics every measurement counts.
 *   - **Annualized run-rate** (headline "value delivered"): for monthly metrics, the average of the
 *     most recent ≤3 measurements in that window × 12; for annual metrics, the latest measurement in
 *     the window; for one-time metrics, the realized total. This avoids penalizing initiatives that
 *     launched recently while still being grounded in recorded actuals.
 */

export type MetricType = "hours_saved" | "cost_saved" | "revenue_generated" | "custom";
export type MetricPeriod = "monthly" | "annual" | "one_time";

export type MetricInput = {
  type: MetricType;
  period: MetricPeriod;
  unit: string;
  estimatedValue: number | null;
  hourlyRate: number | null;
};

export type MeasurementInput = {
  /** ISO date (YYYY-MM-DD) for the first day of the measured period. */
  periodStart: string;
  value: number;
};

export const RUN_RATE_MONTHS = 3;
const USD_UNITS = new Set(["usd", "$", "dollars", "us$"]);

export function isUsdUnit(unit: string | null | undefined) {
  return USD_UNITS.has((unit ?? "").trim().toLowerCase());
}

/** Annualize a raw per-period value. */
export function annualize(value: number, period: MetricPeriod): number {
  return period === "monthly" ? value * 12 : value;
}

/** Multiplier converting the metric's native unit into USD, or null when it isn't monetizable. */
export function dollarsPerUnit(metric: Pick<MetricInput, "type" | "unit" | "hourlyRate">, defaultHourlyRate: number): number | null {
  switch (metric.type) {
    case "hours_saved":
      return metric.hourlyRate ?? defaultHourlyRate;
    case "cost_saved":
    case "revenue_generated":
      return 1;
    case "custom":
      return isUsdUnit(metric.unit) ? 1 : null;
  }
}

/** "YYYY-MM" key of a date or ISO date string (UTC-safe for date-only strings). */
export function monthKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** First day (YYYY-MM-01) of the month `offset` months from `asOf`'s month. */
export function shiftMonth(asOf: Date | string, offset: number): string {
  const [y, m] = monthKey(asOf).split("-").map(Number);
  const total = y * 12 + (m - 1) + offset;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Measurements whose period starts within the trailing 12 calendar months (inclusive of `asOf`'s month). */
export function trailingWindow<T extends MeasurementInput>(measurements: readonly T[], asOf: Date): T[] {
  const from = monthKey(shiftMonth(asOf, -11));
  const to = monthKey(asOf);
  return measurements.filter((m) => {
    const k = monthKey(m.periodStart);
    return k >= from && k <= to;
  });
}

export type MetricActuals = {
  /** Realized value over the trailing 12 months, in the metric's native unit. */
  trailing12: number;
  /** Annualized run-rate, in the metric's native unit. */
  runRate: number;
  /** Number of measurements that fed the numbers above. */
  count: number;
  latestPeriod: string | null;
};

export function metricActuals(metric: Pick<MetricInput, "period">, measurements: readonly MeasurementInput[], asOf = new Date()): MetricActuals | null {
  const sorted = [...measurements].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  if (metric.period === "one_time") {
    if (sorted.length === 0) return null;
    const total = sorted.reduce((s, m) => s + m.value, 0);
    return { trailing12: total, runRate: total, count: sorted.length, latestPeriod: sorted.at(-1)!.periodStart };
  }
  const window = trailingWindow(sorted, asOf);
  if (window.length === 0) return null;
  const trailing12 = window.reduce((s, m) => s + m.value, 0);
  let runRate: number;
  if (metric.period === "monthly") {
    const recent = window.slice(-RUN_RATE_MONTHS);
    runRate = (recent.reduce((s, m) => s + m.value, 0) / recent.length) * 12;
  } else {
    runRate = window.at(-1)!.value;
  }
  return { trailing12, runRate, count: window.length, latestPeriod: window.at(-1)!.periodStart };
}

export type MetricImpact = {
  /** Annualized estimate in native units (null when no estimate was entered). */
  estimatedAnnual: number | null;
  /** Annualized estimate in USD (null when not monetizable or no estimate). */
  estimatedAnnualUsd: number | null;
  actuals: MetricActuals | null;
  actualRunRateUsd: number | null;
  actualTrailing12Usd: number | null;
  /** Effective USD per unit (hourly rate for hours_saved). */
  usdPerUnit: number | null;
};

export function metricImpact(metric: MetricInput, measurements: readonly MeasurementInput[], defaultHourlyRate: number, asOf = new Date()): MetricImpact {
  const usdPerUnit = dollarsPerUnit(metric, defaultHourlyRate);
  const estimatedAnnual = metric.estimatedValue == null ? null : annualize(metric.estimatedValue, metric.period);
  const actuals = metricActuals(metric, measurements, asOf);
  return {
    estimatedAnnual,
    estimatedAnnualUsd: estimatedAnnual != null && usdPerUnit != null ? estimatedAnnual * usdPerUnit : null,
    actuals,
    actualRunRateUsd: actuals && usdPerUnit != null ? actuals.runRate * usdPerUnit : null,
    actualTrailing12Usd: actuals && usdPerUnit != null ? actuals.trailing12 * usdPerUnit : null,
    usdPerUnit,
  };
}

export type ImpactRollup = {
  estimatedAnnualUsd: number;
  actualRunRateUsd: number;
  actualTrailing12Usd: number;
  estimatedAnnualHours: number;
  actualRunRateHours: number;
  actualTrailing12Hours: number;
  /** True when at least one metric has recorded actuals. */
  hasActuals: boolean;
  /** True when at least one metric has an estimate. */
  hasEstimate: boolean;
};

export const emptyRollup = (): ImpactRollup => ({
  estimatedAnnualUsd: 0,
  actualRunRateUsd: 0,
  actualTrailing12Usd: 0,
  estimatedAnnualHours: 0,
  actualRunRateHours: 0,
  actualTrailing12Hours: 0,
  hasActuals: false,
  hasEstimate: false,
});

/** Roll up an initiative's metrics (each paired with its measurements). */
export function initiativeImpact(
  metrics: readonly { metric: MetricInput; measurements: readonly MeasurementInput[] }[],
  defaultHourlyRate: number,
  asOf = new Date(),
): ImpactRollup {
  const r = emptyRollup();
  for (const { metric, measurements } of metrics) {
    const mi = metricImpact(metric, measurements, defaultHourlyRate, asOf);
    if (mi.estimatedAnnual != null) r.hasEstimate = true;
    if (mi.actuals) r.hasActuals = true;
    r.estimatedAnnualUsd += mi.estimatedAnnualUsd ?? 0;
    r.actualRunRateUsd += mi.actualRunRateUsd ?? 0;
    r.actualTrailing12Usd += mi.actualTrailing12Usd ?? 0;
    if (metric.type === "hours_saved") {
      r.estimatedAnnualHours += mi.estimatedAnnual ?? 0;
      r.actualRunRateHours += mi.actuals?.runRate ?? 0;
      r.actualTrailing12Hours += mi.actuals?.trailing12 ?? 0;
    }
  }
  return r;
}

/** Sum initiative rollups into an org rollup. */
export function sumRollups(rollups: readonly ImpactRollup[]): ImpactRollup {
  return rollups.reduce<ImpactRollup>(
    (acc, r) => ({
      estimatedAnnualUsd: acc.estimatedAnnualUsd + r.estimatedAnnualUsd,
      actualRunRateUsd: acc.actualRunRateUsd + r.actualRunRateUsd,
      actualTrailing12Usd: acc.actualTrailing12Usd + r.actualTrailing12Usd,
      estimatedAnnualHours: acc.estimatedAnnualHours + r.estimatedAnnualHours,
      actualRunRateHours: acc.actualRunRateHours + r.actualRunRateHours,
      actualTrailing12Hours: acc.actualTrailing12Hours + r.actualTrailing12Hours,
      hasActuals: acc.hasActuals || r.hasActuals,
      hasEstimate: acc.hasEstimate || r.hasEstimate,
    }),
    emptyRollup(),
  );
}

export type CostInput = { estimatedBuildCost: number | null; estimatedAnnualRunCost: number | null };

/** First-year cost: build cost + one year of run cost. Null when neither is known. */
export function firstYearCost(c: CostInput): number | null {
  if (c.estimatedBuildCost == null && c.estimatedAnnualRunCost == null) return null;
  return (c.estimatedBuildCost ?? 0) + (c.estimatedAnnualRunCost ?? 0);
}

/**
 * First-year ROI as a ratio: (annual value − first-year cost) / first-year cost.
 * 1.5 means 150 %. Null when costs are unknown or zero.
 */
export function firstYearRoi(annualValueUsd: number, cost: CostInput): number | null {
  const total = firstYearCost(cost);
  if (total == null || total <= 0) return null;
  return (annualValueUsd - total) / total;
}

/**
 * Portfolio ROI, computed only across initiatives that have both cost data and the value in question,
 * so unknown costs don't inflate the result.
 */
export function portfolioRoi(items: readonly { value: number; cost: CostInput }[]): { roi: number | null; count: number; value: number; cost: number } {
  let value = 0;
  let cost = 0;
  let count = 0;
  for (const item of items) {
    const c = firstYearCost(item.cost);
    if (c == null || c <= 0 || item.value <= 0) continue;
    value += item.value;
    cost += c;
    count++;
  }
  return { roi: cost > 0 ? (value - cost) / cost : null, count, value, cost };
}
