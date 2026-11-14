import { describe, expect, it } from "vitest";
import {
  FEATURES,
  PLANS,
  annualSavings,
  featureGateMessage,
  hasFeature,
  initiativeCapMessage,
  initiativeLimit,
  isManaged,
  isSelfServePaid,
  listPrice,
  monthlyEquivalent,
  mrrFor,
  nextPlan,
  planFor,
  planForFeature,
  planLabel,
  planRank,
} from "./plans";

describe("plans", () => {
  it("maps DB plan values", () => {
    expect(planFor("trial").id).toBe("free");
    expect(planFor(null).id).toBe("free");
    expect(planFor("pro").id).toBe("business");
    expect(planFor("engagement").id).toBe("managed");
    expect(planLabel("enterprise")).toBe("Enterprise");
    expect(planLabel("team")).toBe("Team");
  });

  it("limits and features", () => {
    expect(initiativeLimit("trial")).toBe(5);
    expect(initiativeLimit("team")).toBe(25);
    expect(initiativeLimit("business")).toBeNull();
    expect(hasFeature("trial", "intake_link")).toBe(false);
    expect(hasFeature("team", "intake_link")).toBe(true);
    expect(hasFeature("team", "governance_workflow")).toBe(false);
    expect(hasFeature("team", "mcp_write")).toBe(false);
    for (const f of FEATURES) {
      expect(hasFeature("business", f)).toBe(true);
      expect(hasFeature("engagement", f)).toBe(true);
      expect(hasFeature("pro", f)).toBe(true);
    }
  });

  it("names the cheapest plan for a feature", () => {
    expect(planForFeature("export_csv").name).toBe("Team");
    expect(planForFeature("mcp_workspace").name).toBe("Team");
    expect(planForFeature("governance_export").name).toBe("Business");
    expect(planForFeature("mcp_write").name).toBe("Business");
    expect(featureGateMessage("trial", "intake_link")).toMatch(/available on the Team plan.*on Free/);
    expect(featureGateMessage("team", "governance_workflow")).toMatch(/Business plan.*on Team/);
  });

  it("cap messages", () => {
    expect(initiativeCapMessage("trial", 4)).toBeNull();
    expect(initiativeCapMessage("trial", 5)).toMatch(/Upgrade to Team/);
    expect(initiativeCapMessage("team", 25)).toMatch(/Upgrade to Business/);
    expect(initiativeCapMessage("business", 500)).toBeNull();
  });

  it("prices: annual is two months free", () => {
    expect(listPrice("team", "month")).toBe(399);
    expect(listPrice("business", "year")).toBe(9990);
    expect(annualSavings("team")).toBe(798);
    expect(annualSavings("business")).toBe(1998);
    expect(monthlyEquivalent(PLANS.team, "year")).toBe(333);
  });

  it("MRR at list price (annual ÷ 12)", () => {
    expect(mrrFor("team", "month")).toBe(399);
    expect(mrrFor("team", "year")).toBeCloseTo(332.5);
    expect(mrrFor("business", "year")).toBeCloseTo(832.5);
    expect(mrrFor("pro", "month")).toBe(999);
    expect(mrrFor("trial", "month")).toBe(0);
    expect(mrrFor("engagement", "year")).toBe(0);
  });

  it("ranks and next plans", () => {
    expect(planRank("trial")).toBeLessThan(planRank("team"));
    expect(planRank("team")).toBeLessThan(planRank("business"));
    expect(planRank("business")).toBeLessThan(planRank("enterprise"));
    expect(nextPlan("trial")?.id).toBe("team");
    expect(nextPlan("team")?.id).toBe("business");
    expect(nextPlan("business")).toBeNull();
    expect(isSelfServePaid("team")).toBe(true);
    expect(isManaged("enterprise")).toBe(true);
  });
});
