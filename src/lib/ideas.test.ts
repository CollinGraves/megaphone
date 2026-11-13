import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_SAVED_SHARE,
  estimateAnnualHours,
  ideaSignal,
  ideaToInitiativeDefaults,
  normalizeDomain,
  parseAllowedDomains,
  validateIntakeEmail,
  workDomainsFrom,
} from "./ideas";

describe("estimateAnnualHours", () => {
  it("multiplies hours/week × people × 52", () => {
    expect(estimateAnnualHours({ hoursPerWeek: 3, peopleAffected: 10 })).toBe(1560);
  });
  it("returns null without hours, and assumes one person when people is missing", () => {
    expect(estimateAnnualHours({ hoursPerWeek: null, peopleAffected: 20 })).toBeNull();
    expect(estimateAnnualHours({ hoursPerWeek: 0, peopleAffected: 20 })).toBeNull();
    expect(estimateAnnualHours({ hoursPerWeek: 2, peopleAffected: null })).toBe(104);
  });
  it("caps implausible inputs", () => {
    expect(estimateAnnualHours({ hoursPerWeek: 500, peopleAffected: 1 })).toBe(60 * 52);
    expect(estimateAnnualHours({ hoursPerWeek: 1, peopleAffected: 10_000_000 })).toBe(100_000 * 52);
    expect(estimateAnnualHours({ hoursPerWeek: -4, peopleAffected: 3 })).toBeNull();
    expect(estimateAnnualHours({ hoursPerWeek: Number.NaN, peopleAffected: 3 })).toBeNull();
  });
});

describe("ideaSignal", () => {
  it("rates urgent, widespread, time-consuming ideas high", () => {
    const s = ideaSignal({ urgency: "high", hoursPerWeek: 5, peopleAffected: 40 });
    expect(s.level).toBe("high");
    expect(s.reasons).toContain("marked urgent");
  });
  it("rates a medium-urgency idea with moderate hours medium", () => {
    expect(ideaSignal({ urgency: "medium", hoursPerWeek: 2, peopleAffected: 5 }).level).toBe("medium");
  });
  it("rates a nice-to-have with no sizing low", () => {
    expect(ideaSignal({ urgency: "low", hoursPerWeek: null, peopleAffected: null }).level).toBe("low");
    expect(ideaSignal({ urgency: "medium", hoursPerWeek: null, peopleAffected: 3 }).level).toBe("low");
  });
});

describe("normalizeDomain / parseAllowedDomains", () => {
  it("normalizes common inputs", () => {
    expect(normalizeDomain(" @Acme.com ")).toBe("acme.com");
    expect(normalizeDomain("https://www.acme.co.uk/about")).toBe("www.acme.co.uk");
    expect(normalizeDomain("jane@acme.com")).toBe("acme.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });
  it("dedupes to registrable domains and refuses consumer providers", () => {
    const r = parseAllowedDomains("acme.com, eu.acme.com\n@acme-labs.io gmail.com ???");
    expect(r.domains).toEqual(["acme.com", "acme-labs.io"]);
    expect(r.rejected).toEqual(["gmail.com"]);
    expect(r.invalid).toEqual(["???"]);
  });
});

describe("validateIntakeEmail", () => {
  it("accepts allowed domains, including subdomains, case-insensitively", () => {
    expect(validateIntakeEmail("Jane@Acme.com", ["acme.com"])).toEqual({ ok: true, email: "jane@acme.com" });
    expect(validateIntakeEmail("jane@eu.acme.com", ["acme.com"]).ok).toBe(true);
    expect(validateIntakeEmail("jane@acme.example", ["acme.example"]).ok).toBe(true);
  });
  it("rejects other domains when an allow-list is set", () => {
    const r = validateIntakeEmail("jane@other.com", ["acme.com"]);
    expect(r).toMatchObject({ ok: false, reason: "domain" });
    expect(validateIntakeEmail("jane@notacme.com", ["acme.com"]).ok).toBe(false);
    expect(validateIntakeEmail("jane@acme.com.evil.io", ["acme.com"]).ok).toBe(false);
    expect(validateIntakeEmail("jane@gmail.com", ["acme.com"])).toMatchObject({ ok: false, reason: "personal" });
  });
  it("with no allow-list, accepts any work email but not personal or disposable ones", () => {
    expect(validateIntakeEmail("sam@globex.io", []).ok).toBe(true);
    expect(validateIntakeEmail("sam@gmail.com", [])).toMatchObject({ ok: false, reason: "personal" });
    expect(validateIntakeEmail("sam@mailinator.com", [])).toMatchObject({ ok: false, reason: "personal" });
    expect(validateIntakeEmail("sam@uni.edu", [])).toMatchObject({ ok: false, reason: "personal" });
    expect(validateIntakeEmail("nope", [])).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("workDomainsFrom", () => {
  it("returns distinct registrable work domains", () => {
    expect(workDomainsFrom(["a@acme.com", "b@mail.acme.com", "c@gmail.com", "d@globex.co.uk"])).toEqual(["acme.com", "globex.co.uk"]);
  });
});

describe("ideaToInitiativeDefaults", () => {
  const idea = {
    title: "  Auto-draft supplier PO confirmations ",
    problem: "Buyers re-key every PO confirmation into SAP.",
    desiredOutcome: "Confirmations are read and matched automatically.",
    department: "Procurement",
    frequency: "Daily",
    systemsInvolved: "SAP, Outlook",
    urgency: "high" as const,
    submitterName: "Sam Ortiz",
    hoursPerWeek: 4,
    peopleAffected: 12,
  };

  it("prefills an idea-stage initiative with the submission's context", () => {
    const d = ideaToInitiativeDefaults(idea);
    expect(d.initiative.title).toBe("Auto-draft supplier PO confirmations");
    expect(d.initiative.stage).toBe("idea");
    expect(d.initiative.businessUnit).toBe("Procurement");
    expect(d.initiative.problemStatement).toContain("Buyers re-key");
    expect(d.initiative.problemStatement).toContain("Systems involved: SAP, Outlook");
    expect(d.initiative.problemStatement).toContain("Submitted by Sam Ortiz (Procurement)");
    expect(d.initiative.proposedSolution).toContain("matched automatically");
    expect(d.initiative.valueScore).toBe(4);
  });

  it("adds an annual hours-saved estimate when hours are known", () => {
    const d = ideaToInitiativeDefaults(idea);
    expect(d.annualHours).toBe(4 * 12 * 52);
    expect(d.metric).toMatchObject({ type: "hours_saved", unit: "hours", period: "annual" });
    expect(d.metric?.estimatedValue).toBe(Math.round(4 * 12 * 52 * DEFAULT_TIME_SAVED_SHARE));
    expect(d.metric?.assumptions).toContain("4 h/week × 12 people × 52 weeks");
  });

  it("skips the metric without hours data", () => {
    expect(ideaToInitiativeDefaults({ ...idea, hoursPerWeek: null }).metric).toBeNull();
  });
});
