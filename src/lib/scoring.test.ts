import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, normalizeWeights, priorityScore, rankInitiatives, scoreBreakdown, type Rankable } from "./scoring";

const s = (valueScore: number, feasibilityScore: number, alignmentScore: number, riskScore: number) => ({
  valueScore,
  feasibilityScore,
  alignmentScore,
  riskScore,
});

describe("normalizeWeights", () => {
  it("scales weights to sum to 1", () => {
    const w = normalizeWeights({ value: 4, feasibility: 3, alignment: 2, risk: 1 });
    expect(w.value).toBeCloseTo(0.4);
    expect(w.value + w.feasibility + w.alignment + w.risk).toBeCloseTo(1);
  });
  it("falls back to equal weights when all are zero or invalid", () => {
    expect(normalizeWeights({ value: 0, feasibility: -1, alignment: Number.NaN, risk: 0 })).toEqual({
      value: 0.25,
      feasibility: 0.25,
      alignment: 0.25,
      risk: 0.25,
    });
  });
});

describe("priorityScore", () => {
  it("is 100 for best-case scores and 0 for worst-case (risk inverted)", () => {
    expect(priorityScore(s(5, 5, 5, 1), DEFAULT_WEIGHTS)).toBe(100);
    expect(priorityScore(s(1, 1, 1, 5), DEFAULT_WEIGHTS)).toBe(0);
  });
  it("is 50 for all-3s regardless of weights", () => {
    expect(priorityScore(s(3, 3, 3, 3), DEFAULT_WEIGHTS)).toBe(50);
    expect(priorityScore(s(3, 3, 3, 3), { value: 1, feasibility: 0, alignment: 0, risk: 0 })).toBe(50);
  });
  it("applies weights", () => {
    // Only value matters: value 4 → (4-1)/4 = 75
    expect(priorityScore(s(4, 1, 1, 5), { value: 1, feasibility: 0, alignment: 0, risk: 0 })).toBe(75);
    // Higher risk lowers the score
    expect(priorityScore(s(3, 3, 3, 5), DEFAULT_WEIGHTS)).toBeLessThan(priorityScore(s(3, 3, 3, 1), DEFAULT_WEIGHTS));
  });
  it("clamps out-of-range inputs", () => {
    expect(priorityScore(s(9, 9, 9, 0), DEFAULT_WEIGHTS)).toBe(100);
  });
  it("exposes a breakdown that sums to the score", () => {
    const parts = scoreBreakdown(s(4, 2, 5, 2), DEFAULT_WEIGHTS);
    const total = parts.reduce((sum, p) => sum + p.points, 0);
    expect(Math.round(total * 10) / 10).toBe(priorityScore(s(4, 2, 5, 2), DEFAULT_WEIGHTS));
    expect(parts.find((p) => p.key === "risk")!.maxPoints).toBeCloseTo(10);
  });
});

describe("rankInitiatives", () => {
  const item = (id: string, scores: ReturnType<typeof s>, rankOverride: number | null = null): Rankable => ({
    id,
    title: id,
    rankOverride,
    ...scores,
  });

  it("orders by score, ties broken by title", () => {
    const ranked = rankInitiatives([item("b", s(3, 3, 3, 3)), item("a", s(3, 3, 3, 3)), item("top", s(5, 5, 5, 1))], DEFAULT_WEIGHTS);
    expect(ranked.map((r) => r.id)).toEqual(["top", "a", "b"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("pins overridden items to their requested position", () => {
    const ranked = rankInitiatives(
      [item("high", s(5, 5, 5, 1)), item("mid", s(4, 4, 4, 2)), item("low", s(1, 1, 1, 5), 1), item("x", s(2, 2, 2, 4))],
      DEFAULT_WEIGHTS,
    );
    expect(ranked.map((r) => r.id)).toEqual(["low", "high", "mid", "x"]);
    expect(ranked[0].overridden).toBe(true);
    expect(ranked[1].overridden).toBe(false);
  });

  it("appends overrides beyond the list length at the end and resolves collisions by score", () => {
    const ranked = rankInitiatives(
      [item("a", s(5, 5, 5, 1)), item("b", s(1, 1, 1, 5), 2), item("c", s(3, 3, 3, 3), 2), item("d", s(2, 2, 2, 2), 99)],
      DEFAULT_WEIGHTS,
    );
    expect(ranked.map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
  });
});
