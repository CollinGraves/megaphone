import type { ScoringWeights } from "@/db/schema";

/**
 * Prioritization: each initiative is scored 1–5 on value, feasibility, strategic alignment and risk.
 * Scores are normalized to 0–1 ((s − 1) / 4; risk is inverted so lower risk scores higher), weighted
 * by the org's weights (normalized to sum to 1) and scaled to 0–100.
 */

export type Scores = {
  valueScore: number;
  feasibilityScore: number;
  alignmentScore: number;
  riskScore: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = { value: 0.4, feasibility: 0.3, alignment: 0.2, risk: 0.1 };

const clampScore = (s: number) => Math.min(5, Math.max(1, Number.isFinite(s) ? s : 3));

/** Weights scaled to sum to 1. Negative or non-finite weights count as 0; all-zero falls back to equal weights. */
export function normalizeWeights(w: ScoringWeights): ScoringWeights {
  const clean = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  const v = { value: clean(w.value), feasibility: clean(w.feasibility), alignment: clean(w.alignment), risk: clean(w.risk) };
  const total = v.value + v.feasibility + v.alignment + v.risk;
  if (total === 0) return { value: 0.25, feasibility: 0.25, alignment: 0.25, risk: 0.25 };
  return { value: v.value / total, feasibility: v.feasibility / total, alignment: v.alignment / total, risk: v.risk / total };
}

export type ScoreBreakdown = {
  key: keyof ScoringWeights;
  label: string;
  raw: number;
  weight: number;
  /** Contribution to the 0–100 total. */
  points: number;
  /** Max contribution given the weight. */
  maxPoints: number;
};

export function scoreBreakdown(scores: Scores, weights: ScoringWeights): ScoreBreakdown[] {
  const w = normalizeWeights(weights);
  const parts: [keyof ScoringWeights, string, number, boolean][] = [
    ["value", "Business value", scores.valueScore, false],
    ["feasibility", "Feasibility", scores.feasibilityScore, false],
    ["alignment", "Strategic alignment", scores.alignmentScore, false],
    ["risk", "Risk (inverted)", scores.riskScore, true],
  ];
  return parts.map(([key, label, raw, inverted]) => {
    const s = clampScore(raw);
    const normalized = inverted ? (5 - s) / 4 : (s - 1) / 4;
    return { key, label, raw: s, weight: w[key], points: normalized * w[key] * 100, maxPoints: w[key] * 100 };
  });
}

/** Priority score, 0–100, rounded to one decimal. */
export function priorityScore(scores: Scores, weights: ScoringWeights): number {
  const total = scoreBreakdown(scores, weights).reduce((s, p) => s + p.points, 0);
  return Math.round(total * 10) / 10;
}

export type Rankable = Scores & { id: string; title: string; rankOverride: number | null };
export type Ranked<T> = T & { score: number; rank: number; overridden: boolean };

/**
 * Rank by priority score (desc, ties by title). A `rankOverride` pins an item to that 1-based position
 * (lower = higher priority); pinned items take their slot and everything else flows around them. When
 * several items request the same slot, the higher-scoring one wins and the others follow right after.
 */
export function rankInitiatives<T extends Rankable>(items: readonly T[], weights: ScoringWeights): Ranked<T>[] {
  const scored = items.map((it) => ({ ...it, score: priorityScore(it, weights) }));
  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) => b.score - a.score || a.title.localeCompare(b.title);
  const pinned = scored
    .filter((it) => it.rankOverride != null && it.rankOverride >= 1)
    .sort((a, b) => a.rankOverride! - b.rankOverride! || byScore(a, b));
  const natural = scored.filter((it) => !(it.rankOverride != null && it.rankOverride >= 1)).sort(byScore);

  const out: Ranked<T>[] = [];
  let p = 0;
  let n = 0;
  while (p < pinned.length || n < natural.length) {
    const position = out.length + 1;
    const takePinned = p < pinned.length && (n >= natural.length || pinned[p].rankOverride! <= position);
    if (takePinned) out.push({ ...pinned[p++], rank: position, overridden: true });
    else out.push({ ...natural[n++], rank: position, overridden: false });
  }
  return out;
}

export const SCORE_GUIDE: Record<keyof ScoringWeights, { label: string; question: string; levels: [string, string, string, string, string] }> = {
  value: {
    label: "Business value",
    question: "How much measurable value will this create if it works?",
    levels: ["Marginal", "Modest, local benefit", "Meaningful for one team", "Significant for a business unit", "Transformational / enterprise-wide"],
  },
  feasibility: {
    label: "Feasibility",
    question: "How confident are we that it can be delivered with the data, skills and tools we have?",
    levels: ["Major unknowns", "Significant gaps", "Achievable with effort", "Proven pattern, minor gaps", "Straightforward; data and tools ready"],
  },
  alignment: {
    label: "Strategic alignment",
    question: "How closely does it support stated company priorities?",
    levels: ["Nice-to-have", "Loosely related", "Supports a priority", "Directly advances a priority", "Core to the strategy"],
  },
  risk: {
    label: "Risk",
    question: "Regulatory, customer-facing, data-sensitivity and change-management risk. Higher = riskier.",
    levels: ["Very low", "Low", "Moderate", "High", "Very high"],
  },
};
