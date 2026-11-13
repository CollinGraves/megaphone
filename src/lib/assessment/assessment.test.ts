import { describe, expect, it } from "vitest";
import { INDUSTRY_SLUGS, TRIAL_INITIATIVE_LIMIT, VENDOR_SLUGS } from "@/lib/taxonomy";
import {
  AI_TOOLS,
  AnswersSchema,
  bandFor,
  DIMENSIONS,
  insightFor,
  levelFor,
  QUESTIONS,
  rankDimensions,
  readContext,
  recommendationsFor,
  scoreAnswers,
  scoreAssessment,
  selectStarterTemplates,
  STARTER_TEMPLATES,
  SubmissionSchema,
  suggestedPlatforms,
  templateById,
  type Answers,
} from ".";

/** Answer every question with the option whose score is `score` (per dimension override optional). */
const answerAll = (score: number, overrides: Partial<Record<string, number>> = {}): Answers =>
  Object.fromEntries(QUESTIONS.map((q) => [q.id, q.options.findIndex((o) => o.score === (overrides[q.dimension] ?? score))]));

const context = {
  industry: "manufacturing",
  companySize: "201–1,000",
  role: "vp",
  functions: ["operations", "finance"],
  tools: ["microsoft", "openai"],
};

describe("question bank", () => {
  it("has 12–16 questions covering all six dimensions with 4–5 options scored 0–4", () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(12);
    expect(QUESTIONS.length).toBeLessThanOrEqual(16);
    for (const d of DIMENSIONS) expect(QUESTIONS.filter((q) => q.dimension === d.id).length).toBeGreaterThanOrEqual(2);
    for (const q of QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(4);
      expect(q.options.length).toBeLessThanOrEqual(5);
      expect(Math.min(...q.options.map((o) => o.score))).toBe(0);
      expect(Math.max(...q.options.map((o) => o.score))).toBe(4);
    }
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it("maps AI tools onto taxonomy vendors", () => {
    for (const t of AI_TOOLS) expect(VENDOR_SLUGS).toContain(t.slug);
  });
});

describe("scoring", () => {
  it("scores all-minimum answers at 0 (Exploring) and all-maximum at 100 (Leading)", () => {
    expect(scoreAssessment(answerAll(0))).toMatchObject({ scores: { overall: 0 }, level: { id: "exploring" } });
    const top = scoreAssessment(answerAll(4));
    expect(top.scores.overall).toBe(100);
    expect(top.level.id).toBe("leading");
    for (const d of DIMENSIONS) expect(top.scores[d.id]).toBe(100);
  });

  it("scales each dimension to 0–100 and averages dimensions equally", () => {
    const scores = scoreAnswers(answerAll(2, { data: 0, governance: 4 }));
    expect(scores.data).toBe(0);
    expect(scores.governance).toBe(100);
    expect(scores.strategy).toBe(50);
    // (0 + 100 + 4×50) / 6 = 50
    expect(scores.overall).toBe(50);
  });

  it("treats missing and invalid answers as zero", () => {
    const answers = answerAll(4);
    delete answers.strategy_plan;
    answers.strategy_owner = 99;
    expect(scoreAnswers(answers).strategy).toBe(33); // (0 + 0 + 4) / 12
  });

  it.each([
    [0, "exploring"],
    [29, "exploring"],
    [30, "experimenting"],
    [54, "experimenting"],
    [55, "scaling"],
    [79, "scaling"],
    [80, "leading"],
    [100, "leading"],
  ])("level for %i is %s", (overall, id) => {
    expect(levelFor(overall).id).toBe(id);
  });

  it("ranks dimensions weakest first with stable ties", () => {
    const ranked = rankDimensions({ strategy: 50, value: 20, data: 20, technology: 90, people: 50, governance: 10 });
    expect(ranked.map((r) => r.id)).toEqual(["governance", "value", "data", "strategy", "people", "technology"]);
  });
});

describe("validation", () => {
  it("accepts a complete submission and normalizes the source", () => {
    const parsed = SubmissionSchema.parse({ context, answers: answerAll(2), source: "linkedin<script>" });
    expect(parsed.source).toBe("linkedinscript");
    expect(parsed.context.functions).toEqual(["operations", "finance"]);
  });

  it("rejects missing answers, unknown questions and out-of-range options", () => {
    const partial = answerAll(2);
    delete partial.gov_risk;
    expect(AnswersSchema.safeParse(partial).success).toBe(false);
    expect(AnswersSchema.safeParse({ ...answerAll(2), bogus: 1 }).success).toBe(false);
    expect(AnswersSchema.safeParse({ ...answerAll(2), gov_risk: 5 }).success).toBe(false);
    expect(AnswersSchema.safeParse({ ...answerAll(2), gov_risk: -1 }).success).toBe(false);
  });

  it("requires 1–3 known business functions and known tools", () => {
    const bad = (patch: object) => SubmissionSchema.safeParse({ context: { ...context, ...patch }, answers: answerAll(2) }).success;
    expect(bad({ functions: [] })).toBe(false);
    expect(bad({ functions: ["sales", "marketing", "finance", "hr"] })).toBe(false);
    expect(bad({ functions: ["astrology"] })).toBe(false);
    expect(bad({ tools: ["skynet"] })).toBe(false);
    expect(bad({ industry: "piracy" })).toBe(false);
    expect(bad({ tools: [] })).toBe(true);
  });

  it("reads stored context defensively", () => {
    expect(readContext(context)?.industry).toBe("manufacturing");
    expect(readContext({ industry: "x" })).toBeNull();
    expect(readContext(null)).toBeNull();
  });
});

describe("recommendations", () => {
  it("bands scores", () => {
    expect(bandFor(0)).toBe("foundational");
    expect(bandFor(39)).toBe("foundational");
    expect(bandFor(40)).toBe("developing");
    expect(bandFor(69)).toBe("developing");
    expect(bandFor(70)).toBe("strength");
  });

  it("gives next steps for gaps and none for strengths", () => {
    expect(insightFor("data", 10).nextSteps.length).toBeGreaterThan(0);
    expect(insightFor("data", 10).headline).not.toBe(insightFor("data", 50).headline);
    expect(insightFor("data", 90).nextSteps).toEqual([]);
  });

  it("splits strengths and gaps, prioritizing the three weakest gaps", () => {
    const r = recommendationsFor({ strategy: 80, value: 45, data: 10, technology: 95, people: 30, governance: 60 });
    expect(r.strengths.map((s) => s.dimension)).toEqual(["technology", "strategy"]);
    expect(r.gaps.map((g) => g.dimension)).toEqual(["data", "people", "value", "governance"]);
    expect(r.priorities.map((g) => g.dimension)).toEqual(["data", "people", "value"]);
  });

  it("has no gaps for a leading organization", () => {
    const r = recommendationsFor(scoreAnswers(answerAll(4)));
    expect(r.gaps).toEqual([]);
    expect(r.strengths).toHaveLength(6);
  });
});

describe("starter templates", () => {
  it("are well-formed", () => {
    expect(new Set(STARTER_TEMPLATES.map((t) => t.id)).size).toBe(STARTER_TEMPLATES.length);
    for (const t of STARTER_TEMPLATES) {
      for (const s of Object.values(t.scores)) expect(s >= 1 && s <= 5).toBe(true);
      for (const i of t.industries ?? []) expect(INDUSTRY_SLUGS).toContain(i);
      expect(t.valueDrivers.length).toBeGreaterThan(0);
      // Qualitative value only: no dollar figures or percentages in the copy.
      expect(`${t.problem} ${t.solution} ${t.valueDrivers.join(" ")}`).not.toMatch(/[$€£]\s?\d|\d+\s?%/);
    }
  });

  it("returns at most the trial limit and only templates for the chosen functions or cross-functional", () => {
    const picks = selectStarterTemplates({ functions: ["finance", "sales"], industry: "technology", overall: 50 }, TRIAL_INITIATIVE_LIMIT);
    expect(picks.length).toBe(TRIAL_INITIATIVE_LIMIT);
    for (const p of picks) expect(["finance", "sales", "cross_functional"]).toContain(p.function);
    expect(new Set(picks.map((p) => p.id)).size).toBe(picks.length);
  });

  it("spreads picks across the chosen functions", () => {
    const picks = selectStarterTemplates({ functions: ["finance", "sales"], industry: "technology", overall: 50 }, 4);
    const fns = picks.map((p) => p.function);
    expect(fns).toContain("finance");
    expect(fns).toContain("sales");
  });

  it("only offers industry-specific templates to that industry, and ranks them highly", () => {
    const mfg = selectStarterTemplates({ functions: ["operations"], industry: "manufacturing", overall: 60 }, 3);
    expect(mfg.map((p) => p.id)).toContain("mfg_maintenance");
    const retail = selectStarterTemplates({ functions: ["operations"], industry: "retail", overall: 60 }, 10);
    expect(retail.some((p) => p.industries && !p.industries.includes("retail"))).toBe(false);
    expect(selectStarterTemplates({ functions: ["operations"], industry: null }, 10).some((p) => p.industries)).toBe(false);
  });

  it("favors low-effort starters for less ready organizations", () => {
    const early = selectStarterTemplates({ functions: ["customer_service"], industry: "technology", overall: 15 }, 2);
    expect(early.every((p) => p.effort !== "High")).toBe(true);
    const ready = selectStarterTemplates({ functions: ["customer_service"], industry: "technology", overall: 90 }, 4);
    expect(ready.map((p) => p.id)).toContain("cs_self_service");
  });

  it("is deterministic", () => {
    const input = { functions: ["hr", "it", "legal"], industry: "financial_services", overall: 42 };
    expect(selectStarterTemplates(input).map((p) => p.id)).toEqual(selectStarterTemplates(input).map((p) => p.id));
  });

  it("suggests platforms only from tools the company uses", () => {
    const crm = templateById("sales_account_research")!;
    expect(suggestedPlatforms(crm, ["salesforce", "openai"])).toEqual(["salesforce"]);
    // No hinted platform in use: fall back to their first general-purpose assistant.
    expect(suggestedPlatforms(crm, ["anthropic", "openai"])).toEqual(["anthropic"]);
    expect(suggestedPlatforms(crm, [])).toEqual([]);
    expect(suggestedPlatforms(crm, ["databricks"])).toEqual([]);
  });
});
