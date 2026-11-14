/**
 * Creates (or reuses) the Stripe Products, Prices, Billing Portal configuration and — optionally —
 * the webhook endpoint for self-serve billing, in whatever account STRIPE_SECRET_KEY points to.
 * Safe to re-run: everything is matched by fixed product ids, price lookup keys, metadata and URL.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/stripe-setup.ts
 *   npx tsx --tsconfig tsconfig.json scripts/stripe-setup.ts --webhook-url https://your-app.example/api/stripe/webhook
 *
 * Live keys (sk_live_…) are refused unless you pass --live.
 * Prints the env vars to set at the end.
 */
import "./load-env";
import Stripe from "stripe";
import { LOOKUP_KEYS, PRICE_ENV_VARS } from "@/lib/billing/prices";
import { BRAND } from "@/lib/brand";
import { PLANS, SELF_SERVE_PLANS, listPrice, type BillingInterval, type SelfServePlan } from "@/lib/plans";

const APP = "ai-radar";
const INTERVALS: BillingInterval[] = ["month", "year"];
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : null;
}

const isMissing = (err: unknown) => err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";

async function ensureProduct(stripe: Stripe, plan: SelfServePlan): Promise<Stripe.Product> {
  const id = `${APP.replace(/-/g, "_")}_${plan}`;
  const fields = { name: `${BRAND} ${PLANS[plan].name}`, description: PLANS[plan].tagline, metadata: { app: APP, plan } };
  try {
    const existing = await stripe.products.retrieve(id);
    if (existing.name !== fields.name || existing.description !== fields.description || !existing.active) {
      console.log(`  ↻ updating product ${id}`);
      return stripe.products.update(id, { ...fields, active: true });
    }
    console.log(`  ✓ product ${id}`);
    return existing;
  } catch (err) {
    if (!isMissing(err)) throw err;
    console.log(`  + creating product ${id}`);
    return stripe.products.create({ id, ...fields });
  }
}

async function ensurePrice(stripe: Stripe, product: Stripe.Product, plan: SelfServePlan, interval: BillingInterval): Promise<Stripe.Price> {
  const lookupKey = LOOKUP_KEYS[plan][interval];
  const amount = listPrice(plan, interval) * 100;
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const current = data[0];
  const productId = current ? (typeof current.product === "string" ? current.product : current.product.id) : null;
  if (current && current.unit_amount === amount && current.currency === "usd" && current.recurring?.interval === interval && productId === product.id) {
    console.log(`  ✓ price ${lookupKey} (${current.id})`);
    return current;
  }
  // Prices are immutable: create a new one and move the lookup key to it.
  console.log(`  + creating price ${lookupKey} ($${amount / 100}/${interval})${current ? ` replacing ${current.id}` : ""}`);
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: amount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    nickname: `${PLANS[plan].name} ${interval === "year" ? "annual" : "monthly"}`,
    metadata: { app: APP, plan, interval },
  });
  if (current) await stripe.prices.update(current.id, { active: false });
  return price;
}

async function ensurePortal(stripe: Stripe, products: { product: string; prices: string[] }[], returnUrl: string | null) {
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: { enabled: true, default_allowed_updates: ["price", "promotion_code"], products, proration_behavior: "create_prorations" },
  };
  const { data } = await stripe.billingPortal.configurations.list({ limit: 100 });
  const existing = data.find((c) => c.metadata?.app === APP && c.active);
  const common = {
    business_profile: { headline: `${BRAND} workspace billing` },
    metadata: { app: APP },
    ...(returnUrl ? { default_return_url: returnUrl } : {}),
  };
  if (existing) {
    console.log(`  ↻ updating billing portal configuration ${existing.id}`);
    return stripe.billingPortal.configurations.update(existing.id, { features, ...common });
  }
  console.log("  + creating billing portal configuration");
  return stripe.billingPortal.configurations.create({ features, ...common });
}

async function ensureWebhook(stripe: Stripe, url: string): Promise<{ id: string; secret: string | null }> {
  const { data } = await stripe.webhookEndpoints.list({ limit: 100 });
  const existing = data.find((w) => w.url === url);
  if (existing) {
    console.log(`  ↻ updating webhook endpoint ${existing.id} (${url})`);
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: WEBHOOK_EVENTS, disabled: false });
    return { id: existing.id, secret: null };
  }
  console.log(`  + creating webhook endpoint ${url}`);
  const created = await stripe.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: `${BRAND} self-serve billing`, metadata: { app: APP } });
  return { id: created.id, secret: created.secret ?? null };
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set. Use a test-mode key (sk_test_…) from https://dashboard.stripe.com/test/apikeys.");
    process.exit(1);
  }
  const live = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (live && !process.argv.includes("--live")) {
    console.error("Refusing to run against a live Stripe account without --live.");
    process.exit(1);
  }
  const webhookUrl = arg("--webhook-url");
  if (webhookUrl && !/^https?:\/\//.test(webhookUrl)) {
    console.error("--webhook-url must be an absolute http(s) URL, e.g. https://your-app.example/api/stripe/webhook");
    process.exit(1);
  }
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "") || null;
  // STRIPE_API_BASE points at stripe-mock or another fake API for testing this script.
  const base = process.env.STRIPE_API_BASE?.trim() ? new URL(process.env.STRIPE_API_BASE.trim()) : null;
  const stripe = new Stripe(key, {
    appInfo: { name: `${BRAND} setup` },
    ...(base ? { host: base.hostname, port: base.port || (base.protocol === "https:" ? 443 : 80), protocol: base.protocol === "http:" ? ("http" as const) : ("https" as const) } : {}),
  });
  console.log(`Setting up ${BRAND} billing in Stripe (${live ? "LIVE" : "test"} mode)…`);

  const env: Record<string, string> = {};
  const portalProducts: { product: string; prices: string[] }[] = [];
  for (const plan of SELF_SERVE_PLANS) {
    const product = await ensureProduct(stripe, plan);
    const prices: string[] = [];
    for (const interval of INTERVALS) {
      const price = await ensurePrice(stripe, product, plan, interval);
      env[PRICE_ENV_VARS[plan][interval]] = price.id;
      prices.push(price.id);
    }
    portalProducts.push({ product: product.id, prices });
  }

  const portal = await ensurePortal(stripe, portalProducts, appUrl);
  env.STRIPE_PORTAL_CONFIGURATION_ID = portal.id;

  let webhookNote: string | null = null;
  if (webhookUrl) {
    const hook = await ensureWebhook(stripe, webhookUrl);
    if (hook.secret) env.STRIPE_WEBHOOK_SECRET = hook.secret;
    else webhookNote = `Webhook ${hook.id} already existed, so its signing secret can't be shown again. Copy it from the Stripe dashboard (Developers → Webhooks) or roll it there.`;
  }

  console.log("\nDone. Set these environment variables (e.g. in .env.local and on Vercel):\n");
  for (const [k, v] of Object.entries(env)) console.log(`${k}=${v}`);
  if (!webhookUrl) {
    console.log("\nNo --webhook-url given. For local development forward events with the Stripe CLI and use the secret it prints:");
    console.log("  stripe listen --forward-to localhost:3000/api/stripe/webhook");
  }
  if (webhookNote) console.log(`\n${webhookNote}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
