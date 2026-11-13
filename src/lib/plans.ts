/**
 * Workspace plans: prices, limits and features in one place. Pure module (safe on the client).
 *
 * DB plan values: "trial" is the Free plan (kept for compatibility), "team" and "business" are self-serve
 * paid plans billed through Stripe, "engagement" and "enterprise" are provisioned by North Labs (everything on).
 * "pro" is a legacy value treated like Business.
 */

export type DbPlan = "trial" | "team" | "business" | "pro" | "engagement" | "enterprise";
export type SelfServePlan = "team" | "business";
export type BillingInterval = "month" | "year";

export const FEATURES = [
  "intake_link", // shareable idea-intake link for the whole company
  "export_csv", // portfolio CSV export
  "mcp_workspace", // workspace tools over MCP (read)
  "mcp_write", // workspace write tools over MCP
  "governance_workflow", // review requests, approvals, policy stage gate, reminders
  "governance_export", // AI use-case inventory CSV for auditors
] as const;
export type Feature = (typeof FEATURES)[number];

export type PlanDefinition = {
  id: "free" | "team" | "business" | "managed";
  name: string;
  tagline: string;
  /** null = unlimited */
  initiativeLimit: number | null;
  features: readonly Feature[];
  /** USD list prices; null for Free / custom. */
  monthlyPrice: number | null;
  annualPrice: number | null;
  highlights: readonly string[];
};

const ALL: readonly Feature[] = FEATURES;

export const PLANS = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Get your first AI initiatives organized.",
    initiativeLimit: 5,
    features: [],
    monthlyPrice: 0,
    annualPrice: 0,
    highlights: [
      "Up to 5 initiatives",
      "Impact tracking and prioritization",
      "Systems & data dependencies",
      "Radar alerts for your stack",
      "In-app idea submissions",
      "Unlimited teammates",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    tagline: "Run your company's AI portfolio in one place.",
    initiativeLimit: 25,
    features: ["intake_link", "export_csv", "mcp_workspace"],
    monthlyPrice: 399,
    annualPrice: 3990,
    highlights: [
      "Up to 25 initiatives",
      "Everything in Free",
      "Company-wide idea intake link",
      "Portfolio CSV export",
      "Use from Claude, Cursor & ChatGPT (MCP)",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    tagline: "Govern and scale AI across the company.",
    initiativeLimit: null,
    features: ALL,
    monthlyPrice: 999,
    annualPrice: 9990,
    highlights: [
      "Unlimited initiatives",
      "Everything in Team",
      "Governance approvals & review reminders",
      "Approval gate before pilot / production",
      "AI use-case inventory export for auditors",
      "MCP write access",
    ],
  },
  managed: {
    id: "managed",
    name: "Managed by North Labs",
    tagline: "The easy button: we run it with you.",
    initiativeLimit: null,
    features: ALL,
    monthlyPrice: null,
    annualPrice: null,
    highlights: ["Everything in Business", "North Labs team in your workspace", "Guided launch, quarterly reviews, delivery help"],
  },
} as const satisfies Record<string, PlanDefinition>;

export function planFor(dbPlan: DbPlan | string | null | undefined): PlanDefinition {
  switch (dbPlan) {
    case "team":
      return PLANS.team;
    case "business":
    case "pro":
      return PLANS.business;
    case "engagement":
    case "enterprise":
      return PLANS.managed;
    default:
      return PLANS.free;
  }
}

export const initiativeLimit = (dbPlan: DbPlan | string) => planFor(dbPlan).initiativeLimit;
export const hasFeature = (dbPlan: DbPlan | string, feature: Feature) => (planFor(dbPlan).features as readonly string[]).includes(feature);
export const isSelfServePaid = (dbPlan: DbPlan | string) => dbPlan === "team" || dbPlan === "business";
export const isManaged = (dbPlan: DbPlan | string) => dbPlan === "engagement" || dbPlan === "enterprise";

/** The cheapest plan that unlocks a feature (for upgrade prompts). */
export function planForFeature(feature: Feature): PlanDefinition {
  return (PLANS.team.features as readonly string[]).includes(feature) ? PLANS.team : PLANS.business;
}

/** Error text when a workspace is at its initiative cap, or null if there's room. */
export function initiativeCapMessage(dbPlan: DbPlan | string, activeCount: number): string | null {
  const limit = initiativeLimit(dbPlan);
  if (limit == null || activeCount < limit) return null;
  const plan = planFor(dbPlan);
  const next = plan.id === "free" ? PLANS.team : PLANS.business;
  return `The ${plan.name} plan includes up to ${limit} initiatives. Upgrade to ${next.name} to add more, or archive one you no longer need.`;
}

/** Monthly-equivalent price for display. */
export const monthlyEquivalent = (plan: PlanDefinition, interval: BillingInterval) =>
  interval === "year" && plan.annualPrice != null ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
