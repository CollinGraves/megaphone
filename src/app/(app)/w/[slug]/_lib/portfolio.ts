import "server-only";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { impactMeasurements, impactMetrics, initiatives, type Initiative, type Organization } from "@/db/schema";
import { firstYearRoi, initiativeImpact, portfolioRoi, sumRollups, type ImpactRollup, type MeasurementInput } from "@/lib/impact";
import { rankInitiatives } from "@/lib/scoring";

export type PortfolioItem = Initiative & {
  score: number;
  /** Rank among active (non-retired, non-archived) initiatives; null for retired/archived. */
  rank: number | null;
  overridden: boolean;
  impact: ImpactRollup;
  /** First-year ROI on the best available value (actual run-rate if recorded, else estimate). */
  roi: number | null;
  metricCount: number;
};

export type MetricWithMeasurements = typeof impactMetrics.$inferSelect & {
  measurements: (typeof impactMeasurements.$inferSelect)[];
};

/** All metrics (with measurements) for a set of initiatives — 2 queries. */
export async function loadMetrics(initiativeIds: string[]): Promise<Map<string, MetricWithMeasurements[]>> {
  const out = new Map<string, MetricWithMeasurements[]>();
  if (initiativeIds.length === 0) return out;
  const metrics = await db.select().from(impactMetrics).where(inArray(impactMetrics.initiativeId, initiativeIds)).orderBy(impactMetrics.createdAt);
  const measurements = metrics.length
    ? await db
        .select()
        .from(impactMeasurements)
        .where(inArray(impactMeasurements.metricId, metrics.map((m) => m.id)))
        .orderBy(impactMeasurements.periodStart)
    : [];
  const byMetric = new Map<string, (typeof impactMeasurements.$inferSelect)[]>();
  for (const m of measurements) {
    const list = byMetric.get(m.metricId) ?? [];
    list.push(m);
    byMetric.set(m.metricId, list);
  }
  for (const m of metrics) {
    const list = out.get(m.initiativeId) ?? [];
    list.push({ ...m, measurements: byMetric.get(m.id) ?? [] });
    out.set(m.initiativeId, list);
  }
  return out;
}

export function rollupFor(metrics: MetricWithMeasurements[] | undefined, org: Pick<Organization, "defaultHourlyRate">, asOf = new Date()): ImpactRollup {
  return initiativeImpact(
    (metrics ?? []).map((m) => ({
      metric: m,
      measurements: m.measurements.map((x): MeasurementInput => ({ periodStart: x.periodStart, value: x.value })),
    })),
    org.defaultHourlyRate,
    asOf,
  );
}

export function bestValue(impact: ImpactRollup) {
  return impact.hasActuals ? impact.actualRunRateUsd : impact.estimatedAnnualUsd;
}

/**
 * The org's initiatives with scores, ranks and impact rollups. Ranking is always computed across
 * all active initiatives, so filtering a view never changes an initiative's rank.
 */
export async function loadPortfolio(org: Organization, opts: { archived?: boolean } = {}) {
  const rows = await db
    .select()
    .from(initiatives)
    .where(and(eq(initiatives.orgId, org.id), opts.archived ? isNotNull(initiatives.archivedAt) : isNull(initiatives.archivedAt)));
  const metrics = await loadMetrics(rows.map((r) => r.id));
  const asOf = new Date();

  const rankable = rows.filter((r) => r.stage !== "retired" && !r.archivedAt);
  const ranked = new Map(rankInitiatives(rankable, org.scoringWeights).map((r) => [r.id, r]));
  const unranked = rankInitiatives(
    rows.filter((r) => !ranked.has(r.id)).map((r) => ({ ...r, rankOverride: null })),
    org.scoringWeights,
  );
  const scoreOf = new Map(unranked.map((r) => [r.id, r.score]));

  const items: PortfolioItem[] = rows.map((r) => {
    const rk = ranked.get(r.id);
    const impact = rollupFor(metrics.get(r.id), org, asOf);
    return {
      ...r,
      score: rk?.score ?? scoreOf.get(r.id) ?? 0,
      rank: rk?.rank ?? null,
      overridden: rk?.overridden ?? false,
      impact,
      roi: firstYearRoi(bestValue(impact), r),
      metricCount: metrics.get(r.id)?.length ?? 0,
    };
  });
  items.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score || a.title.localeCompare(b.title));

  const totals = sumRollups(items.filter((i) => i.stage !== "retired").map((i) => i.impact));
  const roiActual = portfolioRoi(items.filter((i) => i.impact.hasActuals).map((i) => ({ value: i.impact.actualRunRateUsd, cost: i })));
  const roiEstimated = portfolioRoi(items.filter((i) => i.stage !== "retired").map((i) => ({ value: i.impact.estimatedAnnualUsd, cost: i })));
  return { items, totals, roiActual, roiEstimated, metrics };
}
