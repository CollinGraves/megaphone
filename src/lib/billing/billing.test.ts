import { describe, expect, it } from "vitest";
import { enforcedGovernancePolicy, initiativeUsage } from "./entitlements";
import { allPricesConfigured, missingPriceEnv, planForPrice, priceIdFor } from "./prices";
import { summarizeBilling, type BillingFields } from "./status";
import { decideSubscriptionSync, planChangeAction, subscribedPlan, trialDays, trialEligible, type OrgBillingState, type SubscriptionLike } from "./sync";

const ENV = {
  STRIPE_PRICE_TEAM_MONTHLY: "price_team_m",
  STRIPE_PRICE_TEAM_ANNUAL: "price_team_y",
  STRIPE_PRICE_BUSINESS_MONTHLY: "price_biz_m",
  STRIPE_PRICE_BUSINESS_ANNUAL: "price_biz_y",
};

const PERIOD_END = 1_800_000_000;

function sub(overrides: Partial<SubscriptionLike> & { price?: string; lookupKey?: string | null } = {}): SubscriptionLike {
  const { price = "price_team_m", lookupKey = null, ...rest } = overrides;
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { orgId: "org_1" },
    items: { data: [{ price: { id: price, lookup_key: lookupKey }, current_period_end: PERIOD_END }] },
    ...rest,
  };
}

const freeOrg: OrgBillingState = { id: "org_1", plan: "trial", stripeCustomerId: null, stripeSubscriptionId: null, subscriptionStatus: null };

describe("price mapping", () => {
  it("reads price ids from env", () => {
    expect(priceIdFor("team", "month", ENV)).toBe("price_team_m");
    expect(priceIdFor("business", "year", ENV)).toBe("price_biz_y");
    expect(priceIdFor("team", "month", {})).toBeNull();
    expect(priceIdFor("team", "month", { STRIPE_PRICE_TEAM_MONTHLY: "  " })).toBeNull();
  });

  it("knows when every price is configured", () => {
    expect(allPricesConfigured(ENV)).toBe(true);
    expect(allPricesConfigured({ ...ENV, STRIPE_PRICE_BUSINESS_ANNUAL: "" })).toBe(false);
    expect(missingPriceEnv({ STRIPE_PRICE_TEAM_MONTHLY: "x" })).toEqual(["STRIPE_PRICE_TEAM_ANNUAL", "STRIPE_PRICE_BUSINESS_MONTHLY", "STRIPE_PRICE_BUSINESS_ANNUAL"]);
  });

  it("maps prices back to plan and interval", () => {
    expect(planForPrice({ id: "price_team_y" }, ENV)).toEqual({ plan: "team", interval: "year" });
    expect(planForPrice({ id: "price_biz_m" }, ENV)).toEqual({ plan: "business", interval: "month" });
  });

  it("falls back to lookup keys for prices not in env", () => {
    expect(planForPrice({ id: "price_rotated", lookup_key: "business_annual" }, ENV)).toEqual({ plan: "business", interval: "year" });
    expect(planForPrice({ id: "price_rotated", lookup_key: "team_monthly" }, {})).toEqual({ plan: "team", interval: "month" });
  });

  it("never guesses a plan for unknown prices", () => {
    expect(planForPrice({ id: "price_other", lookup_key: "something_else" }, ENV)).toBeNull();
    expect(planForPrice({ id: "price_other" }, {})).toBeNull();
  });
});

describe("subscription → workspace sync", () => {
  it("active and trialing grant the subscribed plan with interval and period end", () => {
    for (const status of ["active", "trialing"]) {
      const d = decideSubscriptionSync(sub({ status, price: "price_biz_y" }), freeOrg, ENV);
      expect(d.kind).toBe("update");
      if (d.kind !== "update") continue;
      expect(d.update).toEqual({
        plan: "business",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        subscriptionStatus: status,
        billingInterval: "year",
        currentPeriodEnd: new Date(PERIOD_END * 1000),
        cancelAtPeriodEnd: false,
      });
      expect(d.planChanged).toBe(true);
      expect(d.previousPlan).toBe("trial");
    }
  });

  it("past_due keeps the plan but records the status", () => {
    const org: OrgBillingState = { ...freeOrg, plan: "team", stripeSubscriptionId: "sub_1", subscriptionStatus: "active" };
    const d = decideSubscriptionSync(sub({ status: "past_due" }), org, ENV);
    expect(d.kind === "update" && d.update.plan).toBe("team");
    expect(d.kind === "update" && d.update.subscriptionStatus).toBe("past_due");
    expect(d.kind === "update" && d.planChanged).toBe(false);
  });

  it.each(["canceled", "unpaid", "incomplete_expired"])("%s drops the workspace back to Free", (status) => {
    const org: OrgBillingState = { ...freeOrg, plan: "business", stripeSubscriptionId: "sub_1", subscriptionStatus: "active" };
    const d = decideSubscriptionSync(sub({ status, price: "price_biz_m", cancel_at_period_end: true }), org, ENV);
    expect(d.kind).toBe("update");
    if (d.kind !== "update") return;
    expect(d.update.plan).toBe("trial");
    expect(d.update.subscriptionStatus).toBe(status);
    expect(d.update.cancelAtPeriodEnd).toBe(false);
    expect(d.planChanged).toBe(true);
  });

  it("plan changes between Team and Business follow the price", () => {
    const org: OrgBillingState = { ...freeOrg, plan: "team", stripeSubscriptionId: "sub_1", subscriptionStatus: "active" };
    const d = decideSubscriptionSync(sub({ price: "price_biz_m" }), org, ENV);
    expect(d.kind === "update" && d.update.plan).toBe("business");
  });

  it("flags cancel at period end (including Stripe's cancel_at)", () => {
    expect(decideSubscriptionSync(sub({ cancel_at_period_end: true }), freeOrg, ENV)).toMatchObject({ update: { cancelAtPeriodEnd: true, plan: "team" } });
    expect(decideSubscriptionSync(sub({ cancel_at: PERIOD_END }), freeOrg, ENV)).toMatchObject({ update: { cancelAtPeriodEnd: true } });
  });

  it("never touches managed workspaces", () => {
    for (const plan of ["engagement", "enterprise"] as const) {
      expect(decideSubscriptionSync(sub(), { ...freeOrg, plan }, ENV)).toEqual({ kind: "skip", reason: "managed" });
      expect(decideSubscriptionSync(sub({ status: "canceled" }), { ...freeOrg, plan }, ENV)).toEqual({ kind: "skip", reason: "managed" });
    }
  });

  it("ignores late events for an older, ended subscription", () => {
    const org: OrgBillingState = { ...freeOrg, plan: "team", stripeSubscriptionId: "sub_new", subscriptionStatus: "active" };
    expect(decideSubscriptionSync(sub({ id: "sub_old", status: "canceled" }), org, ENV)).toEqual({ kind: "skip", reason: "stale_subscription" });
  });

  it("adopts a new live subscription (re-subscribe after cancelling)", () => {
    const org: OrgBillingState = { ...freeOrg, plan: "trial", stripeSubscriptionId: "sub_old", subscriptionStatus: "canceled" };
    const d = decideSubscriptionSync(sub({ id: "sub_new" }), org, ENV);
    expect(d).toMatchObject({ kind: "update", update: { plan: "team", stripeSubscriptionId: "sub_new" } });
  });

  it("refuses to grant a plan for an unrecognised price", () => {
    expect(decideSubscriptionSync(sub({ price: "price_unknown" }), freeOrg, ENV)).toEqual({ kind: "skip", reason: "unknown_price" });
  });

  it("incomplete subscriptions grant nothing", () => {
    expect(decideSubscriptionSync(sub({ status: "incomplete" }), freeOrg, ENV)).toMatchObject({ update: { plan: "trial", subscriptionStatus: "incomplete" }, planChanged: false });
    // A comped plan stays comped while a new checkout is incomplete.
    expect(decideSubscriptionSync(sub({ status: "incomplete" }), { ...freeOrg, plan: "team" }, ENV)).toMatchObject({ update: { plan: "team" } });
    // A paused subscription stops granting what it granted.
    const paying: OrgBillingState = { ...freeOrg, plan: "team", stripeSubscriptionId: "sub_1", subscriptionStatus: "active" };
    expect(decideSubscriptionSync(sub({ status: "paused" }), paying, ENV)).toMatchObject({ update: { plan: "trial" } });
  });

  it("accepts expanded customer objects", () => {
    expect(decideSubscriptionSync(sub({ customer: { id: "cus_9" } }), freeOrg, ENV)).toMatchObject({ update: { stripeCustomerId: "cus_9" } });
  });

  it("reads the plan from the first recognised item", () => {
    const s = sub();
    s.items.data.unshift({ price: { id: "price_addon" }, current_period_end: 1 });
    expect(subscribedPlan(s, ENV)).toEqual({ plan: "team", interval: "month", periodEnd: PERIOD_END });
  });

  it("classifies plan transitions for the activity log", () => {
    expect(planChangeAction("trial", "team")).toBe("billing.upgraded");
    expect(planChangeAction("team", "business")).toBe("billing.upgraded");
    expect(planChangeAction("business", "team")).toBe("billing.downgraded");
    expect(planChangeAction("team", "trial")).toBe("billing.downgraded");
    expect(planChangeAction("pro", "business")).toBe("billing.plan_changed");
  });
});

describe("trials", () => {
  it("only workspaces that never had a subscription get a trial", () => {
    expect(trialEligible({ stripeSubscriptionId: null, subscriptionStatus: null })).toBe(true);
    expect(trialEligible({ stripeSubscriptionId: "sub_1", subscriptionStatus: "canceled" })).toBe(false);
    expect(trialEligible({ stripeSubscriptionId: null, subscriptionStatus: "canceled" })).toBe(false);
  });

  it("reads STRIPE_TRIAL_DAYS with a 14-day default", () => {
    expect(trialDays({})).toBe(14);
    expect(trialDays({ STRIPE_TRIAL_DAYS: "" })).toBe(14);
    expect(trialDays({ STRIPE_TRIAL_DAYS: "30" })).toBe(30);
    expect(trialDays({ STRIPE_TRIAL_DAYS: "0" })).toBe(0);
    expect(trialDays({ STRIPE_TRIAL_DAYS: "-3" })).toBe(14);
    expect(trialDays({ STRIPE_TRIAL_DAYS: "abc" })).toBe(14);
  });
});

describe("billing summary", () => {
  const base: BillingFields = {
    plan: "trial",
    subscriptionStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    billingInterval: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
  const end = new Date("2027-03-01T12:00:00Z");
  const paid: BillingFields = { ...base, plan: "team", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: "active", billingInterval: "month", currentPeriodEnd: end };

  it("free", () => {
    expect(summarizeBilling(base)).toMatchObject({ kind: "free", badge: "Free", hasLiveSubscription: false, canOpenPortal: false });
    expect(summarizeBilling({ ...base, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: "canceled" }).detail).toMatch(/ended/);
  });

  it("managed", () => {
    expect(summarizeBilling({ ...base, plan: "engagement" })).toMatchObject({ kind: "managed", planName: "Managed by North Labs" });
  });

  it("comped (paid plan without a subscription)", () => {
    expect(summarizeBilling({ ...base, plan: "business" })).toMatchObject({ kind: "comped", badge: "Complimentary", hasLiveSubscription: false });
  });

  it("active, trialing, cancelling and past due", () => {
    expect(summarizeBilling(paid)).toMatchObject({ kind: "subscribed", badge: "Active", detail: "Renews Mar 1, 2027, billed monthly.", hasLiveSubscription: true });
    expect(summarizeBilling({ ...paid, subscriptionStatus: "trialing" })).toMatchObject({ badge: "Trial", trialing: true, detail: "Trial ends Mar 1, 2027, then billed monthly." });
    expect(summarizeBilling({ ...paid, cancelAtPeriodEnd: true })).toMatchObject({ badge: "Cancels soon", detail: "Cancels on Mar 1, 2027. You keep Team until then." });
    expect(summarizeBilling({ ...paid, subscriptionStatus: "past_due" })).toMatchObject({ pastDue: true, tone: "red", hasLiveSubscription: true });
  });
});

describe("entitlements", () => {
  const policy = { approvalRequiredStages: ["pilot", "production"] as ("pilot" | "production")[], reviewIntervalMonths: 6 };

  it("the approval gate only applies with governance_workflow", () => {
    expect(enforcedGovernancePolicy({ plan: "business", governancePolicy: policy }).approvalRequiredStages).toEqual(["pilot", "production"]);
    expect(enforcedGovernancePolicy({ plan: "engagement", governancePolicy: policy }).approvalRequiredStages).toEqual(["pilot", "production"]);
    expect(enforcedGovernancePolicy({ plan: "team", governancePolicy: policy })).toEqual({ approvalRequiredStages: [], reviewIntervalMonths: 6 });
    expect(enforcedGovernancePolicy({ plan: "trial", governancePolicy: policy }).approvalRequiredStages).toEqual([]);
  });

  it("initiative usage", () => {
    expect(initiativeUsage(5, 3)).toMatchObject({ remaining: 2, atLimit: false, ratio: 0.6 });
    expect(initiativeUsage(5, 5)).toMatchObject({ remaining: 0, atLimit: true, overLimit: false });
    expect(initiativeUsage(5, 7)).toMatchObject({ remaining: 0, overLimit: true, ratio: 1 });
    expect(initiativeUsage(null, 40)).toMatchObject({ limit: null, atLimit: false });
  });
});
