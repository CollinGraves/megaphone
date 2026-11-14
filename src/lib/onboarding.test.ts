import { describe, expect, it, vi } from "vitest";

// onboarding.ts also exports DB loaders; keep the evaluator testable without a database.
vi.mock("@/db", () => ({ db: {} }));

import { checklistMode, evaluateActivation, type ActivationCounts, type ActivationOrg } from "./onboarding";

const now = new Date("2026-11-13T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const empty: ActivationCounts = {
  initiatives: 0,
  dependencies: 0,
  estimates: 0,
  members: 1,
  pendingInvites: 0,
  classified: 0,
  ideas: 0,
  intakeEnabled: false,
  actuals: 0,
  apiKeys: 0,
};
const full: ActivationCounts = { ...empty, initiatives: 4, dependencies: 2, estimates: 3, members: 2, classified: 1, ideas: 1, actuals: 1 };
const freeOrg: ActivationOrg = { slug: "acme", plan: "trial", createdAt: daysAgo(1), onboardingDismissedAt: null };

const done = (counts: Partial<ActivationCounts>, org: Partial<ActivationOrg> = {}) =>
  evaluateActivation({ ...empty, ...counts }, { ...freeOrg, ...org }, { now });

describe("evaluateActivation", () => {
  it("starts a fresh workspace at 0% with seven core steps and an optional MCP step", () => {
    const a = done({});
    expect(a.coreTotal).toBe(7);
    expect(a.coreDone).toBe(0);
    expect(a.percent).toBe(0);
    expect(a.complete).toBe(false);
    expect(a.activated).toBe(false);
    expect(a.steps.map((s) => s.id)).toEqual(["initiatives", "dependency", "estimate", "teammate", "risk", "ideas", "actual", "mcp"]);
    expect(a.steps.find((s) => s.id === "mcp")!.optional).toBe(true);
  });

  it("needs three active initiatives and reports progress", () => {
    const two = done({ initiatives: 2 }).steps[0];
    expect(two.done).toBe(false);
    expect(two.progress).toEqual({ current: 2, target: 3 });
    const five = done({ initiatives: 5 }).steps[0];
    expect(five.done).toBe(true);
    expect(five.progress).toEqual({ current: 3, target: 3 });
  });

  it("counts a teammate as a second member or a pending invite", () => {
    const step = (c: Partial<ActivationCounts>) => done(c).steps.find((s) => s.id === "teammate")!.done;
    expect(step({ members: 1 })).toBe(false);
    expect(step({ members: 2 })).toBe(true);
    expect(step({ members: 1, pendingInvites: 1 })).toBe(true);
  });

  it("counts ideas as an idea or the intake link being on", () => {
    const step = (c: Partial<ActivationCounts>) => done(c).steps.find((s) => s.id === "ideas")!.done;
    expect(step({})).toBe(false);
    expect(step({ ideas: 1 })).toBe(true);
    expect(step({ intakeEnabled: true })).toBe(true);
  });

  it("is activated at five core steps and complete at seven; the optional step never counts", () => {
    const five = done({ initiatives: 3, dependencies: 1, estimates: 1, members: 2, classified: 1, apiKeys: 1 });
    expect(five.coreDone).toBe(5);
    expect(five.activated).toBe(true);
    expect(five.complete).toBe(false);
    expect(five.percent).toBe(71);
    const all = evaluateActivation(full, freeOrg, { now });
    expect(all.complete).toBe(true);
    expect(all.percent).toBe(100);
  });

  it("flags stalled self-serve workspaces only after a week with fewer than three steps", () => {
    expect(done({ initiatives: 3, members: 2 }, { createdAt: daysAgo(8) }).stalled).toBe(true);
    expect(done({ initiatives: 3, members: 2 }, { createdAt: daysAgo(7) }).stalled).toBe(false);
    expect(done({ initiatives: 3, members: 2, classified: 1 }, { createdAt: daysAgo(30) }).stalled).toBe(false);
    expect(done({}, { createdAt: daysAgo(30), plan: "team" }).stalled).toBe(true);
    // Managed (North Labs) and suspended workspaces are never "stalled".
    expect(done({}, { createdAt: daysAgo(30), plan: "engagement" }).stalled).toBe(false);
    expect(done({}, { createdAt: daysAgo(30), plan: "enterprise" }).stalled).toBe(false);
    expect(done({}, { createdAt: daysAgo(30), status: "suspended" }).stalled).toBe(false);
  });

  it("links steps to real initiatives when targets are known", () => {
    const a = evaluateActivation({ ...empty, initiatives: 1 }, freeOrg, { now, targets: { initiativeId: "i1", metricInitiativeId: "i2" } });
    const href = (id: string) => a.steps.find((s) => s.id === id)!.href;
    expect(href("initiatives")).toBe("/w/acme/initiatives/templates");
    expect(href("dependency")).toBe("/w/acme/initiatives/i1#dep-data");
    expect(href("estimate")).toBe("/w/acme/initiatives/i1#new-name");
    expect(href("risk")).toBe("/w/acme/initiatives/i1#governance");
    expect(href("actual")).toBe("/w/acme/initiatives/i2#m-value");
    expect(href("teammate")).toBe("/w/acme/settings#invite-email");
    expect(a.steps.find((s) => s.id === "actual")!.waitingFor).toBeUndefined();
    // Without initiatives, initiative-bound steps wait for the first one.
    const fresh = done({});
    expect(fresh.steps.filter((s) => s.waitingFor).map((s) => s.id)).toEqual(["dependency", "estimate", "risk", "actual"]);
    // Actuals need a metric to record against.
    expect(done({ initiatives: 2 }).steps.find((s) => s.id === "actual")!.waitingFor).toBe("an impact estimate");
  });

  it("gates plan-dependent routes: intake link and MCP need Team", () => {
    const free = done({});
    expect(free.steps.find((s) => s.id === "ideas")!.secondary).toBeUndefined();
    expect(free.steps.find((s) => s.id === "mcp")!).toMatchObject({ href: "/w/acme/billing?upgrade=mcp_workspace", requiresPlan: "Team plan" });
    const team = done({}, { plan: "team" });
    expect(team.steps.find((s) => s.id === "ideas")!.secondary?.href).toBe("/w/acme/settings#intake");
    expect(team.steps.find((s) => s.id === "mcp")!).toMatchObject({ href: "/settings#api" });
    expect(team.steps.find((s) => s.id === "mcp")!.requiresPlan).toBeUndefined();
  });
});

describe("checklistMode", () => {
  it("shows the checklist until complete, then a short celebration for self-serve workspaces", () => {
    expect(checklistMode(done({}))).toBe("checklist");
    expect(checklistMode(evaluateActivation(full, freeOrg, { now }))).toBe("celebrate");
    expect(checklistMode(evaluateActivation(full, { ...freeOrg, createdAt: daysAgo(45) }, { now }))).toBe("hidden");
    expect(checklistMode(evaluateActivation(full, { ...freeOrg, plan: "engagement" }, { now }))).toBe("hidden");
  });

  it("hides everything once an admin dismisses it", () => {
    expect(checklistMode(done({}, { onboardingDismissedAt: daysAgo(1) }))).toBe("hidden");
  });
});
