/**
 * What to tell people about a workspace's billing state. Pure (client-safe), unit-tested.
 */
import { isManaged, isSelfServePaid, planFor, type DbPlan } from "@/lib/plans";
import { formatDate } from "@/lib/utils";
import { isLiveStatus } from "./sync";

export type BillingFields = {
  plan: DbPlan;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingInterval: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type BillingSummary = {
  kind: "managed" | "free" | "comped" | "subscribed";
  planName: string;
  /** Short status badge text. */
  badge: string;
  tone: "neutral" | "radar" | "amber" | "red" | "dark" | "violet";
  /** One line under the plan name, or null. */
  detail: string | null;
  pastDue: boolean;
  trialing: boolean;
  /** A live Stripe subscription exists (changes go through the billing portal, not a new checkout). */
  hasLiveSubscription: boolean;
  /** A Stripe customer exists, so the billing portal (invoices, cards) is available. */
  canOpenPortal: boolean;
};

const intervalWord = (i: string | null) => (i === "year" ? "annually" : i === "month" ? "monthly" : null);

export function summarizeBilling(org: BillingFields): BillingSummary {
  const plan = planFor(org.plan);
  const live = Boolean(org.stripeSubscriptionId) && isLiveStatus(org.subscriptionStatus);
  const base = {
    planName: plan.name,
    pastDue: false,
    trialing: false,
    hasLiveSubscription: live,
    canOpenPortal: Boolean(org.stripeCustomerId),
  };

  if (isManaged(org.plan)) {
    return { ...base, kind: "managed", planName: "Managed by North Labs", badge: "Managed", tone: "dark", detail: "Billing is handled through your North Labs agreement.", hasLiveSubscription: false };
  }

  if (isSelfServePaid(org.plan) || org.plan === "pro") {
    if (!live) {
      return { ...base, kind: "comped", badge: "Complimentary", tone: "violet", detail: `${plan.name} features are provided by North Labs at no charge.` };
    }
    const end = org.currentPeriodEnd ? formatDate(org.currentPeriodEnd) : null;
    const billed = intervalWord(org.billingInterval);
    if (org.subscriptionStatus === "past_due") {
      return { ...base, kind: "subscribed", badge: "Payment past due", tone: "red", pastDue: true, detail: "Your last payment didn’t go through. Update your payment method to keep your plan." };
    }
    if (org.subscriptionStatus === "trialing") {
      return {
        ...base,
        kind: "subscribed",
        badge: "Trial",
        tone: "amber",
        trialing: true,
        detail: end ? (org.cancelAtPeriodEnd ? `Trial ends ${end}; the subscription won’t renew.` : `Trial ends ${end}, then billed ${billed ?? "per your plan"}.`) : "Free trial in progress.",
      };
    }
    if (org.cancelAtPeriodEnd) {
      return { ...base, kind: "subscribed", badge: "Cancels soon", tone: "amber", detail: end ? `Cancels on ${end}. You keep ${plan.name} until then.` : "Set to cancel at the end of the billing period." };
    }
    return { ...base, kind: "subscribed", badge: "Active", tone: "radar", detail: end ? `Renews ${end}${billed ? `, billed ${billed}` : ""}.` : billed ? `Billed ${billed}.` : null };
  }

  // Free
  const ended = org.subscriptionStatus && !isLiveStatus(org.subscriptionStatus);
  return {
    ...base,
    kind: "free",
    badge: "Free",
    tone: "neutral",
    detail: ended ? "Your paid subscription has ended. Upgrade any time to get your features back." : null,
  };
}
