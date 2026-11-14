import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { stripeEvents } from "@/db/schema";
import { freshSubscription, handleCheckoutCompleted, handlePaymentFailed, syncSubscription, webhookSecret } from "@/lib/billing/server";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook. Verifies the signature against STRIPE_WEBHOOK_SECRET, records the event id in
 * `stripe_events` before handling it (so redeliveries are acknowledged without re-processing), and
 * releases the id again if handling fails so Stripe's retry can process it.
 */
export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret) return Response.json({ error: "Stripe webhooks are not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe-Signature header." }, { status: 400 });

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.warn("[stripe webhook] signature verification failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  const [claimed] = await db
    .insert(stripeEvents)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing({ target: stripeEvents.id })
    .returning({ id: stripeEvents.id });
  if (!claimed) return Response.json({ received: true, duplicate: true });

  try {
    await handleEvent(event);
  } catch (err) {
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    console.error(`[stripe webhook] ${event.type} ${event.id} failed:`, err);
    return Response.json({ error: "Webhook handler failed." }, { status: 500 });
  }
  return Response.json({ received: true });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      // Events can arrive out of order; prefer the subscription's current state when the API is reachable.
      await syncSubscription(await freshSubscription(event.data.object));
      return;
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object);
      return;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object);
      return;
    default:
      // Not subscribed to anything else; acknowledge so Stripe doesn't retry.
      return;
  }
}
