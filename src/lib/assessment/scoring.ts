/**
 * Pure scoring for the AI Readiness Assessment.
 *
 *  - Each answer scores 0–4. A dimension's score is the mean of its answers scaled to 0–100.
 *  - Overall is the unweighted mean of the six dimensions, so every dimension counts equally
 *    regardless of how many questions it has.
 *  - The maturity level is a band of the overall score.
 */
import { z } from "zod";
import { COMPANY_SIZES, INDUSTRY_SLUGS } from "@/lib/taxonomy";
import {
  AI_TOOL_SLUGS,
  BUSINESS_FUNCTIONS,
  DIMENSIONS,
  MAX_FUNCTIONS,
  QUESTION_BY_ID,
  QUESTIONS,
  ROLES,
  type DimensionId,
  type FunctionSlug,
  type RoleSlug,
} from "./questions";
import type { VendorSlug, IndustrySlug } from "@/lib/taxonomy";

export type Answers = Record<string, number>;
export type DimensionScores = Record<DimensionId, number>;
export type AssessmentScores = DimensionScores & { overall: number };

export type AssessmentContext = {
  industry: IndustrySlug;
  companySize: (typeof COMPANY_SIZES)[number];
  role: RoleSlug;
  functions: FunctionSlug[];
  tools: VendorSlug[];
};

export const LEVELS = [
  {
    id: "exploring",
    label: "Exploring",
    min: 0,
    summary: "AI is on the radar, but there's no shared plan, ownership or foundation yet.",
    focus: "Pick a sponsor, set guardrails and run one or two low-risk, high-visibility pilots.",
  },
  {
    id: "experimenting",
    label: "Experimenting",
    min: 30,
    summary: "Pockets of AI activity are underway, but they're not yet coordinated, measured or repeatable.",
    focus: "Turn scattered experiments into a prioritized portfolio with owners and measured outcomes.",
  },
  {
    id: "scaling",
    label: "Scaling",
    min: 55,
    summary: "AI is delivering in several places, with the foundations to take more use cases into production.",
    focus: "Standardize the platform, data access and governance so each new use case is faster than the last.",
  },
  {
    id: "leading",
    label: "Leading",
    min: 80,
    summary: "AI is managed as a portfolio, embedded in how the business runs and measured against results.",
    focus: "Compound the advantage: deeper automation, agentic workflows and continuous re-prioritization.",
  },
] as const;

export type LevelId = (typeof LEVELS)[number]["id"];
export type Level = (typeof LEVELS)[number];

export function levelFor(overall: number): Level {
  let level: Level = LEVELS[0];
  for (const l of LEVELS) if (overall >= l.min) level = l;
  return level;
}

export const levelById = (id: string): Level | undefined => LEVELS.find((l) => l.id === id);

/** Scores answers. Unknown question ids and out-of-range options are ignored; missing questions count as 0. */
export function scoreAnswers(answers: Answers): AssessmentScores {
  const totals = Object.fromEntries(DIMENSIONS.map((d) => [d.id, { sum: 0, n: 0 }])) as Record<DimensionId, { sum: number; n: number }>;
  for (const q of QUESTIONS) {
    const idx = answers[q.id];
    const option = Number.isInteger(idx) ? q.options[idx] : undefined;
    totals[q.dimension].n += 1;
    totals[q.dimension].sum += option?.score ?? 0;
  }
  const dims = Object.fromEntries(
    DIMENSIONS.map((d) => {
      const t = totals[d.id];
      return [d.id, t.n ? Math.round((t.sum / (t.n * 4)) * 100) : 0];
    }),
  ) as DimensionScores;
  const overall = Math.round(DIMENSIONS.reduce((s, d) => s + dims[d.id], 0) / DIMENSIONS.length);
  return { ...dims, overall };
}

export function scoreAssessment(answers: Answers): { scores: AssessmentScores; level: Level } {
  const scores = scoreAnswers(answers);
  return { scores, level: levelFor(scores.overall) };
}

/** Dimension scores ordered from weakest to strongest (ties keep the canonical dimension order). */
export function rankDimensions(scores: Partial<Record<string, number>>): { id: DimensionId; score: number }[] {
  return DIMENSIONS.map((d, i) => ({ id: d.id, score: Number(scores[d.id] ?? 0), i }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map(({ id, score }) => ({ id, score }));
}

/* ───────────────────────────── Input validation ───────────────────────────── */

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

export const ContextSchema = z.object({
  industry: enumOf(INDUSTRY_SLUGS),
  companySize: z.enum(COMPANY_SIZES),
  role: enumOf(ROLES.map((r) => r.slug)),
  functions: z
    .array(enumOf(BUSINESS_FUNCTIONS.map((f) => f.slug)))
    .min(1, "Choose at least one business function")
    .max(MAX_FUNCTIONS, `Choose up to ${MAX_FUNCTIONS} business functions`)
    .transform((v) => [...new Set(v)]),
  tools: z
    .array(enumOf(AI_TOOL_SLUGS))
    .max(AI_TOOL_SLUGS.length)
    .transform((v) => [...new Set(v)]),
});

/** Every question must be answered with a valid option index; unknown keys are rejected. */
export const AnswersSchema = z
  .record(z.string().max(64), z.number().int().min(0))
  .superRefine((answers, ctx) => {
    for (const [id, idx] of Object.entries(answers)) {
      const q = QUESTION_BY_ID.get(id);
      if (!q) ctx.addIssue({ code: "custom", message: `Unknown question: ${id}` });
      else if (idx >= q.options.length) ctx.addIssue({ code: "custom", message: `Invalid answer for: ${id}` });
    }
    const missing = QUESTIONS.filter((q) => answers[q.id] === undefined);
    if (missing.length) ctx.addIssue({ code: "custom", message: `Please answer every question (${missing.length} missing).` });
  });

export const SubmissionSchema = z.object({
  context: ContextSchema,
  answers: AnswersSchema,
  source: z
    .string()
    .max(80)
    .optional()
    .transform((s) => (s ?? "").replace(/[^\w:.\-]/g, "").slice(0, 80) || null),
});

/** Reads a stored context jsonb defensively (older rows / partial data never crash a page). */
export function readContext(raw: unknown): AssessmentContext | null {
  const parsed = ContextSchema.safeParse(raw);
  return parsed.success ? (parsed.data as AssessmentContext) : null;
}
