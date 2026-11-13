/**
 * Subscription → workspace mapping rules. Pure: given a Stripe subscription (or the subset of it we
 * read) and the workspace's current billing state, decide what to write. The DB/Stripe I/O lives in
 * `server.ts`; everything here is unit-tested.
 *
 * Rules
 *  - Managed workspaces (engagement / enterprise) are never touched by self-serve billing.
 *  - active / trialing        → the subscribed plan.
 *  - past_due                 → keep the subscribed plan, flag the status (the UI shows a banner).
 *  - canceled / unpaid / incomplete_expired → back to Free ("trial").
 *  - incomplete / paused / unknown → don't grant anything: keep the current plan unless it came from
 *    this same subscription, in which case drop to Free.
 *  - Events for a *different* subscription than the one on file are ignored unless that subscription
 *    is live (a re-subscribe after cancelling), so a late "deleted" for an old subscription can't
 *    downgrade a workspace that has since subscribed again.
 */
import { isManaged, type BillingInterval, type DbPlan, type SelfServePlan } from "@/lib/plans";
import { planForPrice, type PriceLike } from "./prices";

type Env = Record<string, string | undefined>;

export type SubscriptionLike = {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end: boolean;
  cancel_at?: number | null;
  trial_end?: number | null;
  metadata?: Record<string, string> | null;
  items: { data: { price: PriceLike; current_period_end?: number | null }[] };
};

export type OrgBillingState = {
  id: string;
  plan: DbPlan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;
};

export type OrgBillingUpdate = {
  plan: DbPlan;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  billingInterval: BillingInterval | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type SyncDecision =
  | { kind: "skip"; reason: "managed" | "stale_subscription" | "unknown_price" }
  | { kind: "update"; update: OrgBillingUpdate; previousPlan: DbPlan; planChanged: boolean };

export const LIVE_STATUSES = ["active", "trialing", "past_due"] as const;
export const ENDED_STATUSES = ["canceled", "unpaid", "incomplete_expired"] as const;

export const isLiveStatus = (s: string | null | undefined) => (LIVE_STATUSES as readonly string[]).includes(s ?? "");
export const isEndedStatus = (s: string | null | undefined) => (ENDED_STATUSES as readonly string[]).includes(s ?? "");

export const customerIdOf = (c: SubscriptionLike["customer"]) => (typeof c === "string" ? c : c.id);

/** The self-serve plan a subscription is for (first recognised price among its items). */
export function subscribedPlan(sub: SubscriptionLike, env: Env = process.env): { plan: SelfServePlan; interval: BillingInterval; periodEnd: number | null } | null {
  for (const item of sub.items.data) {
    const match = planForPrice(item.price, env);
    if (match) return { ...match, periodEnd: item.current_period_end ?? null };
  }
  return null;
}

export function decideSubscriptionSync(sub: SubscriptionLike, org: OrgBillingState, env: Env = process.env): SyncDecision {
  if (isManaged(org.plan)) return { kind: "skip", reason: "managed" };

  const sameSubscription = !org.stripeSubscriptionId || org.stripeSubscriptionId === sub.id;
  if (!sameSubscription && !isLiveStatus(sub.status)) return { kind: "skip", reason: "stale_subscription" };

  const match = subscribedPlan(sub, env);
  if (!match && isLiveStatus(sub.status)) return { kind: "skip", reason: "unknown_price" };

  let plan: DbPlan;
  if (isLiveStatus(sub.status)) plan = match!.plan;
  else if (isEndedStatus(sub.status)) plan = "trial";
  // incomplete / paused / anything new: grant nothing. Only revoke what this subscription granted.
  else plan = sameSubscription && org.stripeSubscriptionId === sub.id && (org.plan === "team" || org.plan === "business" || org.plan === "pro") ? "trial" : org.plan;

  const periodEnd = match?.periodEnd ?? null;
  const update: OrgBillingUpdate = {
    plan,
    stripeCustomerId: customerIdOf(sub.customer),
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    billingInterval: match?.interval ?? null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end || sub.cancel_at) && !isEndedStatus(sub.status),
  };
  return { kind: "update", update, previousPlan: org.plan, planChanged: org.plan !== plan };
}

/** A workspace can get a free trial only if it has never had a subscription. */
export const trialEligible = (org: Pick<OrgBillingState, "stripeSubscriptionId" | "subscriptionStatus">) =>
  !org.stripeSubscriptionId && !org.subscriptionStatus;

/** Trial length from STRIPE_TRIAL_DAYS (default 14; 0 disables trials). */
export function trialDays(env: Env = process.env): number {
  const raw = env.STRIPE_TRIAL_DAYS?.trim();
  if (raw === undefined || raw === "") return 14;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 730 ? n : 14;
}

/** Activity-log action for a plan transition. */
export function planChangeAction(from: DbPlan, to: DbPlan): "billing.upgraded" | "billing.downgraded" | "billing.plan_changed" {
  const rank = (p: DbPlan) => (p === "trial" ? 0 : p === "team" ? 1 : p === "business" || p === "pro" ? 2 : 3);
  if (rank(to) > rank(from)) return "billing.upgraded";
  if (rank(to) < rank(from)) return "billing.downgraded";
  return "billing.plan_changed";
}
