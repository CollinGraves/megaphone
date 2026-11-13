import { describe, expect, it } from "vitest";
import {
  approvalInForce,
  canDecide,
  canRequestReview,
  computeReviewDue,
  csvCell,
  decisionReopenedBy,
  governanceIssues,
  materialChanges,
  maxSensitivity,
  normalizePolicy,
  reviewState,
  stageChangeBlocked,
  suggestRiskTier,
  type GovernanceSubject,
} from "./governance";

const today = "2026-11-13";

describe("maxSensitivity", () => {
  it("returns the most sensitive class, health data highest", () => {
    expect(maxSensitivity([])).toBeNull();
    expect(maxSensitivity(["internal", "public"])).toBe("internal");
    expect(maxSensitivity(["confidential", "pii", "internal"])).toBe("pii");
    expect(maxSensitivity(["pii", "phi", "pci"])).toBe("phi");
    expect(maxSensitivity(["pci", "pii"])).toBe("pci");
  });
  it("ignores unknown values", () => {
    expect(maxSensitivity([null, "bogus", "public"])).toBe("public");
  });
});

describe("suggestRiskTier", () => {
  const base = { customerFacing: false, affectsIndividuals: false, maxSensitivity: "internal", humanOversight: "spot_check" };

  it("suggests minimal for internal use with every question answered", () => {
    const s = suggestRiskTier(base);
    expect(s.tier).toBe("minimal");
    expect(s.missing).toEqual([]);
    expect(s.explanation).toMatch(/^Minimal risk because it is internal/);
  });

  it("won't guess minimal while key questions are unanswered", () => {
    const s = suggestRiskTier({ ...base, customerFacing: null, affectsIndividuals: null });
    expect(s.tier).toBe("unclassified");
    expect(s.missing).toHaveLength(2);
    expect(s.explanation).toMatch(/^Answer /);
  });

  it("customer-facing → limited", () => {
    const s = suggestRiskTier({ ...base, customerFacing: true });
    expect(s.tier).toBe("limited");
    expect(s.explanation).toContain("customers");
  });

  it("regulated data with people in the loop → limited", () => {
    expect(suggestRiskTier({ ...base, maxSensitivity: "pii" }).tier).toBe("limited");
    expect(suggestRiskTier({ ...base, maxSensitivity: "confidential" }).tier).toBe("minimal");
  });

  it("regulated data, fully automated → high", () => {
    const s = suggestRiskTier({ ...base, maxSensitivity: "phi", humanOversight: "none" });
    expect(s.tier).toBe("high");
    expect(s.explanation).toContain("PHI");
  });

  it("decisions about individuals → high, even with a human deciding", () => {
    const s = suggestRiskTier({ ...base, affectsIndividuals: true, humanOversight: "human_decides" });
    expect(s.tier).toBe("high");
    expect(s.reasons[0]).toContain("decisions about individuals");
  });

  it("raises from known facts even when other answers are missing, and lists them", () => {
    const s = suggestRiskTier({ customerFacing: true, affectsIndividuals: null, maxSensitivity: null, humanOversight: null });
    expect(s.tier).toBe("limited");
    expect(s.missing).toEqual(["whether it informs decisions about individuals"]);
    expect(s.explanation).toContain("Still unanswered");
  });

  it("asks about oversight when regulated data is involved", () => {
    const s = suggestRiskTier({ ...base, maxSensitivity: "pci", humanOversight: null });
    expect(s.tier).toBe("limited");
    expect(s.missing).toContain("the level of human oversight");
  });

  it("combines reasons and never suggests prohibited", () => {
    const s = suggestRiskTier({ customerFacing: true, affectsIndividuals: true, maxSensitivity: "pii", humanOversight: "none" });
    expect(s.tier).toBe("high");
    expect(s.reasons).toHaveLength(3);
  });
});

describe("stageChangeBlocked", () => {
  const policy = { approvalRequiredStages: ["production" as const] };
  const at = (approvalStatus: string, reviewDueOn: string | null = null) => ({ approvalStatus, reviewDueOn, today, policy });

  it("allows stages the policy doesn't gate", () => {
    expect(stageChangeBlocked({ ...at("not_submitted"), fromStage: "building", toStage: "pilot" })).toBeNull();
  });
  it("blocks entering a gated stage without approval", () => {
    expect(stageChangeBlocked({ ...at("not_submitted"), fromStage: "pilot", toStage: "production" })).toMatch(/request a review/);
    expect(stageChangeBlocked({ ...at("pending"), fromStage: "pilot", toStage: "production" })).toMatch(/pending/);
    expect(stageChangeBlocked({ ...at("rejected"), fromStage: "pilot", toStage: "production" })).toMatch(/not approved/);
  });
  it("allows approved and conditionally approved initiatives", () => {
    expect(stageChangeBlocked({ ...at("approved", "2027-11-13"), fromStage: "pilot", toStage: "production" })).toBeNull();
    expect(stageChangeBlocked({ ...at("conditional"), fromStage: "pilot", toStage: "production" })).toBeNull();
  });
  it("blocks when the approval's review is overdue", () => {
    expect(stageChangeBlocked({ ...at("approved", "2026-11-12"), fromStage: "pilot", toStage: "production" })).toMatch(/lapsed/);
  });
  it("doesn't block edits that keep the stage (grandfathered)", () => {
    expect(stageChangeBlocked({ ...at("not_submitted"), fromStage: "production", toStage: "production" })).toBeNull();
  });
  it("blocks creating a new initiative directly in a gated stage", () => {
    expect(stageChangeBlocked({ ...at("not_submitted"), fromStage: null, toStage: "production" })).toMatch(/earlier stage/);
  });
});

describe("review dates", () => {
  it("adds months, clamping to month end", () => {
    expect(computeReviewDue(new Date("2026-11-13T15:00:00Z"), 12)).toBe("2027-11-13");
    expect(computeReviewDue(new Date("2026-08-31T10:00:00Z"), 6)).toBe("2027-02-28");
    expect(computeReviewDue(new Date("2027-08-31T10:00:00Z"), 6)).toBe("2028-02-29");
    expect(computeReviewDue(new Date("2026-01-15T00:00:00Z"), 24)).toBe("2028-01-15");
  });
  it("classifies review state", () => {
    expect(reviewState({ approvalStatus: "pending", reviewDueOn: "2020-01-01" }, today)).toBe("none");
    expect(reviewState({ approvalStatus: "approved", reviewDueOn: null }, today)).toBe("none");
    expect(reviewState({ approvalStatus: "approved", reviewDueOn: "2027-06-01" }, today)).toBe("ok");
    expect(reviewState({ approvalStatus: "conditional", reviewDueOn: "2026-12-01" }, today)).toBe("due_soon");
    expect(reviewState({ approvalStatus: "approved", reviewDueOn: "2026-11-12" }, today)).toBe("overdue");
    expect(approvalInForce({ approvalStatus: "approved", reviewDueOn: today }, today)).toBe(true);
  });
  it("lets editors request a review when new, rejected, or an approval is coming due", () => {
    expect(canRequestReview({ approvalStatus: "not_submitted", reviewDueOn: null }, today)).toBe(true);
    expect(canRequestReview({ approvalStatus: "rejected", reviewDueOn: null }, today)).toBe(true);
    expect(canRequestReview({ approvalStatus: "pending", reviewDueOn: null }, today)).toBe(false);
    expect(canRequestReview({ approvalStatus: "approved", reviewDueOn: "2027-11-13" }, today)).toBe(false);
    expect(canRequestReview({ approvalStatus: "approved", reviewDueOn: "2026-11-20" }, today)).toBe(true);
    expect(canDecide("pending")).toBe(true);
    expect(canDecide("conditional")).toBe(true);
    expect(canDecide("rejected")).toBe(false);
  });
});

describe("re-review on material change", () => {
  const before = { riskTier: "limited", customerFacing: true, affectsIndividuals: false, humanOversight: "review_all" };
  it("detects material changes", () => {
    expect(materialChanges(before, { ...before })).toEqual([]);
    expect(materialChanges(before, { ...before, humanOversight: "none", riskTier: "high" })).toEqual(["riskTier", "humanOversight"]);
  });
  it("reopens decided reviews only", () => {
    expect(decisionReopenedBy("approved", ["riskTier"])).toBe(true);
    expect(decisionReopenedBy("rejected", ["riskTier"])).toBe(true);
    expect(decisionReopenedBy("pending", ["riskTier"])).toBe(false);
    expect(decisionReopenedBy("approved", [])).toBe(false);
  });
});

describe("governanceIssues", () => {
  const subject = (over: Partial<GovernanceSubject> = {}): GovernanceSubject => ({
    stage: "building",
    riskTier: "minimal",
    customerFacing: false,
    affectsIndividuals: false,
    humanOversight: "spot_check",
    approvalStatus: "not_submitted",
    approvalRequestedAt: null,
    reviewDueOn: null,
    ...over,
  });
  const opts = { policy: { approvalRequiredStages: [] as ("pilot" | "production")[] }, today, maxSensitivity: "internal" };
  const codes = (s: GovernanceSubject, o = opts) => governanceIssues(s, o).map((i) => i.code);

  it("is clean for a classified internal initiative", () => {
    expect(codes(subject())).toEqual([]);
  });
  it("flags unclassified initiatives in pilot or production", () => {
    expect(codes(subject({ riskTier: "unclassified", stage: "pilot" }))).toEqual(["unclassified_live"]);
    expect(codes(subject({ riskTier: "unclassified", stage: "building" }))).toEqual([]);
  });
  it("flags high risk without oversight", () => {
    expect(codes(subject({ riskTier: "high", affectsIndividuals: true, humanOversight: "none" }))).toContain("high_risk_no_oversight");
    expect(codes(subject({ riskTier: "high", affectsIndividuals: true, humanOversight: null }))).toContain("high_risk_no_oversight");
    expect(codes(subject({ riskTier: "high", affectsIndividuals: true, humanOversight: "human_decides" }))).toEqual([]);
  });
  it("flags overdue reviews and stale pending requests", () => {
    expect(codes(subject({ approvalStatus: "approved", reviewDueOn: "2026-10-01" }))).toEqual(["review_overdue"]);
    expect(codes(subject({ approvalStatus: "pending", approvalRequestedAt: new Date("2026-10-01T12:00:00Z") }))).toEqual(["pending_stale"]);
    expect(codes(subject({ approvalStatus: "pending", approvalRequestedAt: new Date("2026-11-10T12:00:00Z") }))).toEqual([]);
  });
  it("flags prohibited use cases that are still active, not retired ones", () => {
    expect(codes(subject({ riskTier: "prohibited" }))).toEqual(["prohibited_active"]);
    expect(codes(subject({ riskTier: "prohibited", stage: "retired" }))).toEqual([]);
  });
  it("flags initiatives in a gated stage without approval, and live rejected ones", () => {
    const gated = { ...opts, policy: { approvalRequiredStages: ["production" as const] } };
    expect(codes(subject({ stage: "production" }), gated)).toEqual(["unapproved_in_gated_stage"]);
    expect(codes(subject({ stage: "production", approvalStatus: "approved", reviewDueOn: "2027-01-01" }), gated)).toEqual([]);
    expect(codes(subject({ stage: "pilot", approvalStatus: "rejected" }))).toEqual(["rejected_but_live"]);
  });
  it("flags tiers lower than the answers suggest, most severe issues first", () => {
    const issues = governanceIssues(subject({ riskTier: "minimal", affectsIndividuals: true, humanOversight: "none", stage: "pilot" }), opts);
    expect(issues.map((i) => i.code)).toEqual(["under_classified"]);
    const mixed = governanceIssues(subject({ riskTier: "high", humanOversight: "none", stage: "pilot", approvalStatus: "approved", reviewDueOn: "2026-01-01" }), opts);
    expect(mixed[0].severity).toBe("high");
    expect(mixed.map((i) => i.code)).toEqual(["high_risk_no_oversight", "review_overdue"]);
  });
});

describe("normalizePolicy", () => {
  it("keeps valid stages and falls back on bad intervals", () => {
    expect(normalizePolicy(null)).toEqual({ approvalRequiredStages: [], reviewIntervalMonths: 12 });
    expect(normalizePolicy({ approvalRequiredStages: ["production", "idea" as never, "pilot"], reviewIntervalMonths: 6 })).toEqual({
      approvalRequiredStages: ["pilot", "production"],
      reviewIntervalMonths: 6,
    });
    expect(normalizePolicy({ reviewIntervalMonths: -3 }).reviewIntervalMonths).toBe(12);
  });
});

describe("csvCell", () => {
  it("quotes and neutralizes formulas", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("Yes");
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a, "b"')).toBe('"a, ""b"""');
    expect(csvCell(-5)).toBe("-5");
  });
});
