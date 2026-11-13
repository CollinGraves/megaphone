import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { activityLog, memberships, organizations, user, type Organization } from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { emailLayout, escapeHtml, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/env";
import { isManaged, PLANS, type BillingInterval, type SelfServePlan } from "@/lib/plans";
import { allPricesConfigured, priceIdFor } from "./prices";
import { decideSubscriptionSync, planChangeAction, trialDays, trialEligible, type SubscriptionLike, type SyncDecision } from "./sync";

/*
 * Stripe I/O for self-serve billing: the API client, Checkout and Billing Portal sessions, and the
 * DB side of subscription sync. The mapping rules themselves are pure (sync.ts / prices.ts).
 */

export class BillingError extends Error {}

let cached: Stripe | null | undefined;

/** The Stripe client, or null when STRIPE_SECRET_KEY isn't set. */
export function stripeClient(): Stripe | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return (cached = null);
  // Optional override for local testing against stripe-mock or a fake API (e.g. http://localhost:12111).
  const base = process.env.STRIPE_API_BASE?.trim();
  const target = base ? new URL(base) : null;
  cached = new Stripe(key, {
    appInfo: { name: BRAND, url: appUrl() },
    maxNetworkRetries: 2,
    timeout: 20_000,
    ...(target ? { host: target.hostname, port: target.port || (target.protocol === "https:" ? 443 : 80), protocol: target.protocol === "http:" ? "http" : "https" } : {}),
  });
  return cached;
}

/** Self-serve checkout is available: API key and all four plan prices are configured. */
export const billingConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY?.trim()) && allPricesConfigured();

export const webhookSecret = () => process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;

const billingUrl = (slug: string) => `${appUrl()}/w/${slug}/billing`;

function requireClient(): Stripe {
  const stripe = stripeClient();
  if (!stripe || !billingConfigured()) throw new BillingError("Online checkout isn’t set up yet. Contact North Labs to upgrade.");
  return stripe;
}

/** The workspace's Stripe customer, created (with org metadata) on first use. */
async function ensureCustomer(stripe: Stripe, org: Organization, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe.customers.create(
    { name: org.name, email, metadata: { orgId: org.id, orgSlug: org.slug } },
    { idempotencyKey: `customer:${org.id}` },
  );
  const [saved] = await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(and(eq(organizations.id, org.id), isNull(organizations.stripeCustomerId)))
    .returning({ id: organizations.stripeCustomerId });
  if (saved?.id) return saved.id;
  // Someone else attached a customer concurrently: use theirs.
  const [row] = await db.select({ id: organizations.stripeCustomerId }).from(organizations).where(eq(organizations.id, org.id)).limit(1);
  return row?.id ?? customer.id;
}

/** Starts a subscription Checkout for a Free (or comped) workspace. Returns the hosted Checkout URL. */
export async function createCheckoutSession(input: {
  org: Organization;
  user: { id: string; email: string };
  plan: SelfServePlan;
  interval: BillingInterval;
}): Promise<{ url: string; trialDays: number | null }> {
  const { org, plan, interval } = input;
  if (isManaged(org.plan)) throw new BillingError("This workspace is managed by North Labs, so billing goes through your agreement.");
  const stripe = requireClient();
  const price = priceIdFor(plan, interval);
  if (!price) throw new BillingError("That plan isn’t available for online checkout yet. Contact North Labs to upgrade.");

  const customer = await ensureCustomer(stripe, org, input.user.email);
  const days = trialEligible(org) ? trialDays() : 0;
  const metadata = { orgId: org.id, orgSlug: org.slug, plan, interval, initiatedBy: input.user.id };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: org.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    customer_update: { address: "auto", name: "auto" },
    metadata,
    subscription_data: {
      metadata,
      description: `${BRAND} ${PLANS[plan].name} · ${org.name}`,
      ...(days > 0 ? { trial_period_days: days } : {}),
    },
    success_url: `${billingUrl(org.slug)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${billingUrl(org.slug)}?checkout=canceled`,
  });
  if (!session.url) throw new BillingError("Stripe didn’t return a checkout page. Please try again.");
  return { url: session.url, trialDays: days > 0 ? days : null };
}

/** Billing Portal: cards, invoices, plan changes and cancellation. */
export async function createPortalSession(org: Organization): Promise<string> {
  if (isManaged(org.plan)) throw new BillingError("This workspace is managed by North Labs, so billing goes through your agreement.");
  const stripe = stripeClient();
  if (!stripe) throw new BillingError("Online billing isn’t set up yet. Contact North Labs for invoices or plan changes.");
  if (!org.stripeCustomerId) throw new BillingError("This workspace doesn’t have a billing account yet. Choose a plan to get started.");
  const session = await stripe.billingPortal.sessions.create({ customer: org.stripeCustomerId, return_url: billingUrl(org.slug) });
  return session.url;
}

/* ───────────────────────────── Subscription sync ───────────────────────────── */

async function logBilling(orgId: string, action: string, detail: Record<string, unknown>, userId?: string | null) {
  let actor: string | null = null;
  if (userId) {
    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
    actor = u?.id ?? null;
  }
  await db.insert(activityLog).values({ orgId, userId: actor, action, detail });
}

/** Find the workspace a subscription belongs to: explicit org id, then subscription id, then customer id. */
async function findOrgFor(sub: SubscriptionLike, orgIdHint?: string | null) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const hint = orgIdHint ?? sub.metadata?.orgId ?? null;
  if (hint) {
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, hint)).limit(1);
    if (org) return org.id;
  }
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(or(eq(organizations.stripeSubscriptionId, sub.id), eq(organizations.stripeCustomerId, customerId)))
    .orderBy(sql`(${organizations.stripeSubscriptionId} = ${sub.id}) desc nulls last`)
    .limit(1);
  return org?.id ?? null;
}

export type SyncResult = { orgId: string | null; decision: SyncDecision | null };

/**
 * Apply a Stripe subscription to its workspace (plan, status, interval, period end,
 * cancel-at-period-end) and log plan changes. Safe to call repeatedly with the same subscription.
 */
export async function syncSubscription(sub: SubscriptionLike, opts: { orgIdHint?: string | null } = {}): Promise<SyncResult> {
  const orgId = await findOrgFor(sub, opts.orgIdHint);
  if (!orgId) {
    console.warn(`[billing] no workspace for subscription ${sub.id}`);
    return { orgId: null, decision: null };
  }
  return db.transaction(async (tx) => {
    // Lock the row so concurrent webhook deliveries apply one at a time.
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update").limit(1);
    if (!org) return { orgId: null, decision: null };
    const decision = decideSubscriptionSync(sub, org);
    if (decision.kind === "skip") {
      if (decision.reason !== "stale_subscription") console.warn(`[billing] skipped ${sub.id} for ${org.slug}: ${decision.reason}`);
      return { orgId, decision };
    }
    const u = decision.update;
    await tx.update(organizations).set(u).where(eq(organizations.id, org.id));

    const detail = { from: decision.previousPlan, to: u.plan, interval: u.billingInterval, status: u.subscriptionStatus, subscriptionId: sub.id, via: "stripe" };
    const entries: { action: string; detail: Record<string, unknown> }[] = [];
    if (decision.planChanged) {
      entries.push({ action: u.subscriptionStatus === "canceled" || u.subscriptionStatus === "unpaid" || u.subscriptionStatus === "incomplete_expired" ? "billing.canceled" : planChangeAction(decision.previousPlan, u.plan), detail });
    } else if (org.subscriptionStatus !== u.subscriptionStatus) {
      entries.push({ action: "billing.status_changed", detail: { ...detail, previousStatus: org.subscriptionStatus } });
    }
    if (org.cancelAtPeriodEnd !== u.cancelAtPeriodEnd && u.subscriptionStatus !== "canceled") {
      entries.push({ action: u.cancelAtPeriodEnd ? "billing.cancel_scheduled" : "billing.cancel_reverted", detail: { ...detail, periodEnd: u.currentPeriodEnd?.toISOString() ?? null } });
    }
    if (entries.length) {
      // Attribute the first activation to whoever started checkout.
      let actor: string | null = null;
      const initiatedBy = sub.metadata?.initiatedBy;
      if (initiatedBy && decision.planChanged && decision.previousPlan === "trial") {
        const [found] = await tx.select({ id: user.id }).from(user).where(eq(user.id, initiatedBy)).limit(1);
        actor = found?.id ?? null;
      }
      await tx.insert(activityLog).values(entries.map((e) => ({ orgId: org.id, userId: actor, action: e.action, detail: e.detail })));
    }
    return { orgId, decision };
  });
}

/** Latest state of a subscription from the API when we can reach it; otherwise the event payload. */
export async function freshSubscription(sub: SubscriptionLike): Promise<SubscriptionLike> {
  const stripe = stripeClient();
  if (!stripe) return sub;
  try {
    return await stripe.subscriptions.retrieve(sub.id);
  } catch (err) {
    console.warn(`[billing] couldn't refresh ${sub.id}; using the event payload`, err instanceof Error ? err.message : err);
    return sub;
  }
}

/** checkout.session.completed: link the customer/subscription to the workspace, then sync it. */
export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") return;
  const orgId = session.client_reference_id ?? session.metadata?.orgId ?? null;
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const subscription = session.subscription;
  const subscriptionId = typeof subscription === "string" ? subscription : (subscription?.id ?? null);
  if (!orgId || !customerId || !subscriptionId) {
    console.warn(`[billing] checkout ${session.id} is missing org/customer/subscription`);
    return;
  }
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return console.warn(`[billing] checkout ${session.id} for unknown workspace ${orgId}`);
  if (isManaged(org.plan)) return console.warn(`[billing] checkout ${session.id} for managed workspace ${org.slug}; not linking`);

  await db
    .update(organizations)
    .set({ stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId })
    .where(eq(organizations.id, org.id));
  await logBilling(org.id, "billing.checkout_completed", { plan: session.metadata?.plan ?? null, interval: session.metadata?.interval ?? null, subscriptionId }, session.metadata?.initiatedBy);

  // The session only carries the subscription id. With API access, sync it now; otherwise the
  // customer.subscription.* events that Stripe sends alongside will.
  const stripe = stripeClient();
  if (typeof subscription === "object" && subscription) {
    await syncSubscription(subscription, { orgIdHint: org.id });
  } else if (stripe) {
    try {
      await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId), { orgIdHint: org.id });
    } catch (err) {
      console.warn(`[billing] couldn't load ${subscriptionId} after checkout; waiting for subscription events`, err instanceof Error ? err.message : err);
    }
  }
}

/* ───────────────────────────── Payment failures ───────────────────────────── */

async function billingManagers(orgId: string) {
  return db
    .select({ email: user.email, name: user.name })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ["owner", "admin"])));
}

/** invoice.payment_failed: flag it in the activity log and email the workspace's owners and admins. */
export async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subRef = invoice.parent?.subscription_details?.subscription ?? null;
  const subscriptionId = typeof subRef === "string" ? subRef : (subRef?.id ?? null);
  const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? null);
  if (!subscriptionId && !customerId) return;
  const [org] = await db
    .select()
    .from(organizations)
    .where(
      or(
        subscriptionId ? eq(organizations.stripeSubscriptionId, subscriptionId) : undefined,
        customerId ? eq(organizations.stripeCustomerId, customerId) : undefined,
      ),
    )
    .limit(1);
  if (!org || isManaged(org.plan)) return;

  const amount = typeof invoice.amount_due === "number" ? invoice.amount_due / 100 : null;
  const currency = (invoice.currency ?? "usd").toUpperCase();
  const amountText = amount != null ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount) : null;
  const retry = invoice.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null;
  await logBilling(org.id, "billing.payment_failed", { invoiceId: invoice.id, amount: amountText, attempt: invoice.attempt_count ?? null });

  const url = billingUrl(org.slug);
  const subject = `Payment failed for your ${BRAND} ${org.name} workspace`;
  const retryText = retry ? ` Stripe will try again on ${retry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.` : "";
  const body = `<h1 style="margin:0 0 8px;font-size:18px">We couldn’t process your payment</h1>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#334155">The latest ${amountText ? `${escapeHtml(amountText)} ` : ""}payment for the ${escapeHtml(org.name)} workspace didn’t go through.${escapeHtml(retryText)} Update your payment method to keep your plan’s features.</p>
<p style="margin:20px 0 0"><a href="${url}" style="display:inline-block;background:#0b1220;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Update payment method</a></p>`;
  const text = `${subject}\n\nThe latest ${amountText ?? ""} payment for ${org.name} didn't go through.${retryText} Update your payment method: ${url}`;
  const html = emailLayout({ preheader: subject, body, footer: `You're receiving this because you manage billing for ${escapeHtml(org.name)} on ${BRAND}.` });
  for (const m of await billingManagers(org.id)) {
    const res = await sendEmail({ to: m.email, subject, html, text });
    if (res.status === "failed") console.error(`[billing] payment-failed email to ${m.email} failed: ${res.error}`);
  }
}
