import { describe, expect, it } from "vitest";
import {
  annualize,
  dollarsPerUnit,
  firstYearRoi,
  initiativeImpact,
  metricActuals,
  metricImpact,
  portfolioRoi,
  shiftMonth,
  sumRollups,
  trailingWindow,
  type MetricInput,
} from "./impact";

const asOf = new Date(2026, 10, 13); // 13 Nov 2026 (local time)

const metric = (over: Partial<MetricInput> = {}): MetricInput => ({
  type: "cost_saved",
  period: "monthly",
  unit: "usd",
  estimatedValue: null,
  hourlyRate: null,
  ...over,
});

describe("annualize", () => {
  it("multiplies monthly by 12, keeps annual and one-time as-is", () => {
    expect(annualize(100, "monthly")).toBe(1200);
    expect(annualize(100, "annual")).toBe(100);
    expect(annualize(100, "one_time")).toBe(100);
  });
});

describe("dollarsPerUnit", () => {
  it("uses the metric hourly rate, falling back to the org default", () => {
    expect(dollarsPerUnit(metric({ type: "hours_saved", unit: "hours", hourlyRate: 120 }), 75)).toBe(120);
    expect(dollarsPerUnit(metric({ type: "hours_saved", unit: "hours" }), 75)).toBe(75);
  });
  it("treats cost and revenue as USD, custom only when its unit is USD", () => {
    expect(dollarsPerUnit(metric({ type: "revenue_generated" }), 75)).toBe(1);
    expect(dollarsPerUnit(metric({ type: "custom", unit: "USD" }), 75)).toBe(1);
    expect(dollarsPerUnit(metric({ type: "custom", unit: "tickets" }), 75)).toBeNull();
  });
});

describe("months", () => {
  it("shifts across year boundaries", () => {
    expect(shiftMonth(asOf, -11)).toBe("2025-12-01");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-01");
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
  });
  it("keeps only the trailing 12 calendar months", () => {
    const ms = [
      { periodStart: "2025-11-01", value: 1 },
      { periodStart: "2025-12-01", value: 2 },
      { periodStart: "2026-11-01", value: 3 },
      { periodStart: "2026-12-01", value: 4 },
    ];
    expect(trailingWindow(ms, asOf).map((m) => m.value)).toEqual([2, 3]);
  });
});

describe("metricActuals", () => {
  it("returns null without measurements", () => {
    expect(metricActuals(metric(), [], asOf)).toBeNull();
  });

  it("sums trailing 12 months and annualizes the last 3 months for monthly metrics", () => {
    const ms = [
      { periodStart: "2026-10-01", value: 300 },
      { periodStart: "2026-06-01", value: 100 },
      { periodStart: "2026-08-01", value: 200 },
      { periodStart: "2026-09-01", value: 250 },
      { periodStart: "2024-01-01", value: 9999 }, // outside window
    ];
    const a = metricActuals(metric(), ms, asOf)!;
    expect(a.trailing12).toBe(850);
    expect(a.runRate).toBe(((200 + 250 + 300) / 3) * 12);
    expect(a.count).toBe(4);
    expect(a.latestPeriod).toBe("2026-10-01");
  });

  it("annualizes from fewer than 3 months when that's all there is", () => {
    const a = metricActuals(metric(), [{ periodStart: "2026-10-01", value: 50 }], asOf)!;
    expect(a.runRate).toBe(600);
  });

  it("uses the latest value for annual metrics and everything for one-time metrics", () => {
    const annual = metricActuals(metric({ period: "annual" }), [
      { periodStart: "2026-01-01", value: 10 },
      { periodStart: "2026-07-01", value: 20 },
    ], asOf)!;
    expect(annual.runRate).toBe(20);
    expect(annual.trailing12).toBe(30);

    const once = metricActuals(metric({ period: "one_time" }), [
      { periodStart: "2020-01-01", value: 10 },
      { periodStart: "2026-07-01", value: 5 },
    ], asOf)!;
    expect(once.trailing12).toBe(15);
    expect(once.runRate).toBe(15);
  });
});

describe("metricImpact / initiativeImpact", () => {
  it("converts hours to dollars and rolls up per initiative", () => {
    const hours = metric({ type: "hours_saved", unit: "hours", estimatedValue: 100, hourlyRate: null });
    const cost = metric({ type: "cost_saved", estimatedValue: 5000, period: "annual" });
    const custom = metric({ type: "custom", unit: "tickets", estimatedValue: 40 });

    const hi = metricImpact(hours, [{ periodStart: "2026-10-01", value: 80 }], 50, asOf);
    expect(hi.estimatedAnnual).toBe(1200);
    expect(hi.estimatedAnnualUsd).toBe(60_000);
    expect(hi.actualRunRateUsd).toBe(80 * 12 * 50);

    const r = initiativeImpact(
      [
        { metric: hours, measurements: [{ periodStart: "2026-10-01", value: 80 }] },
        { metric: cost, measurements: [] },
        { metric: custom, measurements: [{ periodStart: "2026-10-01", value: 30 }] },
      ],
      50,
      asOf,
    );
    expect(r.estimatedAnnualUsd).toBe(60_000 + 5000);
    expect(r.actualRunRateUsd).toBe(48_000);
    expect(r.actualTrailing12Usd).toBe(4000);
    expect(r.estimatedAnnualHours).toBe(1200);
    expect(r.actualRunRateHours).toBe(960);
    expect(r.hasActuals).toBe(true);
    expect(r.hasEstimate).toBe(true);
  });

  it("sums rollups across initiatives", () => {
    const a = initiativeImpact([{ metric: metric({ estimatedValue: 10 }), measurements: [] }], 75, asOf);
    const b = initiativeImpact([], 75, asOf);
    const total = sumRollups([a, b]);
    expect(total.estimatedAnnualUsd).toBe(120);
    expect(total.hasActuals).toBe(false);
    expect(total.hasEstimate).toBe(true);
  });
});

describe("ROI", () => {
  it("computes first-year ROI only when costs are known", () => {
    expect(firstYearRoi(300, { estimatedBuildCost: 100, estimatedAnnualRunCost: 100 })).toBe(0.5);
    expect(firstYearRoi(300, { estimatedBuildCost: null, estimatedAnnualRunCost: null })).toBeNull();
    expect(firstYearRoi(300, { estimatedBuildCost: 0, estimatedAnnualRunCost: 0 })).toBeNull();
  });

  it("aggregates portfolio ROI across initiatives with both cost and value", () => {
    const p = portfolioRoi([
      { value: 300, cost: { estimatedBuildCost: 100, estimatedAnnualRunCost: null } },
      { value: 100, cost: { estimatedBuildCost: null, estimatedAnnualRunCost: 100 } },
      { value: 1000, cost: { estimatedBuildCost: null, estimatedAnnualRunCost: null } }, // excluded: no cost
      { value: 0, cost: { estimatedBuildCost: 50, estimatedAnnualRunCost: null } }, // excluded: no value
    ]);
    expect(p.count).toBe(2);
    expect(p.roi).toBe(1);
  });
});
