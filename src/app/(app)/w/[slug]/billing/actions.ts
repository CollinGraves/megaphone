"use server";

import { redirect } from "next/navigation";
import { BillingError, billingConfigured, createCheckoutSession, createPortalSession } from "@/lib/billing/server";
import { summarizeBilling } from "@/lib/billing/status";
import { isBillingInterval, isManaged, isSelfServePlan, PLANS } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, runAction } from "../_lib/action-utils";

const MANAGED_MESSAGE = "This workspace is managed by North Labs, so plan changes go through your North Labs agreement.";

async function guard(ctx: WorkspaceContext, action: string) {
  if (isManaged(ctx.org.plan)) throw new ActionError(MANAGED_MESSAGE);
  const limit = await rateLimit(`billing:${action}:${ctx.org.id}`, 20, 3600);
  if (!limit.allowed) throw new ActionError("Too many attempts. Please wait a few minutes and try again.");
}

/** Stripe failures become a friendly message; our own BillingErrors pass through. */
async function callStripe<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BillingError) throw new ActionError(err.message);
    console.error("[billing] Stripe request failed:", err);
    throw new ActionError("We couldn’t reach our payment provider. Please try again in a minute.");
  }
}

/** Upgrade a Free (or complimentary) workspace: send the billing manager to Stripe Checkout. */
export async function startCheckout(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "billing:manage");
    const plan = form.get("plan");
    const interval = form.get("interval");
    if (!isSelfServePlan(plan) || !isBillingInterval(interval)) throw new ActionError("Choose a plan and billing interval.");
    await guard(ctx, "checkout");
    if (!billingConfigured()) throw new ActionError("Online checkout isn’t available yet. Contact North Labs and we’ll upgrade you.");

    let url: string;
    if (summarizeBilling(ctx.org).hasLiveSubscription) {
      // Already subscribed: plan changes happen in the billing portal (prorated), never a second subscription.
      url = await callStripe(() => createPortalSession(ctx.org));
      await logActivity(ctx, "billing.portal_opened", { reason: "change_plan", plan, interval });
    } else {
      const session = await callStripe(() => createCheckoutSession({ org: ctx.org, user: ctx.user, plan, interval }));
      url = session.url;
      await logActivity(ctx, "billing.checkout_started", { plan, interval, trialDays: session.trialDays, planName: PLANS[plan].name });
    }
    redirect(url);
  });
}

/** Invoices, payment method, plan changes and cancellation in the Stripe Billing Portal. */
export async function openBillingPortal(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "billing:manage");
    await guard(ctx, "portal");
    const url = await callStripe(() => createPortalSession(ctx.org));
    await logActivity(ctx, "billing.portal_opened", {});
    redirect(url);
  });
}
