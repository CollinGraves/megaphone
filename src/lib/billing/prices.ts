/**
 * Stripe price ↔ plan/interval mapping. Pure module (reads env only through the `env` argument
 * so it's unit-testable).
 *
 * Each self-serve plan has a monthly and an annual recurring price. Their ids come from env
 * (STRIPE_PRICE_TEAM_MONTHLY …); `scripts/stripe-setup.ts` creates them with the lookup keys below,
 * which also serve as a fallback when an incoming subscription's price id isn't in env (e.g. a
 * price was rotated in the Stripe dashboard).
 */
import { SELF_SERVE_PLANS, type BillingInterval, type SelfServePlan } from "@/lib/plans";

export type PlanPrice = { plan: SelfServePlan; interval: BillingInterval };
type Env = Record<string, string | undefined>;

export const PRICE_ENV_VARS = {
  team: { month: "STRIPE_PRICE_TEAM_MONTHLY", year: "STRIPE_PRICE_TEAM_ANNUAL" },
  business: { month: "STRIPE_PRICE_BUSINESS_MONTHLY", year: "STRIPE_PRICE_BUSINESS_ANNUAL" },
} as const satisfies Record<SelfServePlan, Record<BillingInterval, string>>;

export const LOOKUP_KEYS = {
  team: { month: "team_monthly", year: "team_annual" },
  business: { month: "business_monthly", year: "business_annual" },
} as const satisfies Record<SelfServePlan, Record<BillingInterval, string>>;

const INTERVALS: readonly BillingInterval[] = ["month", "year"];

const clean = (v: string | undefined) => (v ?? "").trim() || null;

/** The configured Stripe price id for a plan/interval, or null if that env var is unset. */
export function priceIdFor(plan: SelfServePlan, interval: BillingInterval, env: Env = process.env): string | null {
  return clean(env[PRICE_ENV_VARS[plan][interval]]);
}

/** True when every plan/interval has a price id configured. */
export function allPricesConfigured(env: Env = process.env): boolean {
  return SELF_SERVE_PLANS.every((p) => INTERVALS.every((i) => priceIdFor(p, i, env) != null));
}

/** Env var names that are missing (for setup diagnostics). */
export function missingPriceEnv(env: Env = process.env): string[] {
  return SELF_SERVE_PLANS.flatMap((p) => INTERVALS.filter((i) => priceIdFor(p, i, env) == null).map((i) => PRICE_ENV_VARS[p][i]));
}

/** Minimal shape of a Stripe Price we need (keeps tests free of SDK fixtures). */
export type PriceLike = { id: string; lookup_key?: string | null; recurring?: { interval?: string | null } | null };

/**
 * Which plan/interval a Stripe price stands for: env price ids first, then lookup keys.
 * Returns null for prices that aren't ours (never guess a plan from an unknown price).
 */
export function planForPrice(price: PriceLike, env: Env = process.env): PlanPrice | null {
  for (const plan of SELF_SERVE_PLANS) {
    for (const interval of INTERVALS) {
      if (priceIdFor(plan, interval, env) === price.id) return { plan, interval };
    }
  }
  if (price.lookup_key) {
    for (const plan of SELF_SERVE_PLANS) {
      for (const interval of INTERVALS) {
        if (LOOKUP_KEYS[plan][interval] === price.lookup_key) return { plan, interval };
      }
    }
  }
  return null;
}
