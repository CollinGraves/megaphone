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
  /** AI build briefs per rolling 30 days (each costs model usage); null = unlimited. */
  briefsPerMonth: number | null;
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
    briefsPerMonth: 3,
    features: [],
    monthlyPrice: 0,
    annualPrice: 0,
    highlights: [
      "Up to 5 initiatives",
      "3 AI build briefs / month",
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
    briefsPerMonth: 15,
    features: ["intake_link", "export_csv", "mcp_workspace"],
    monthlyPrice: 399,
    annualPrice: 3990,
    highlights: [
      "Up to 25 initiatives",
      "15 AI build briefs / month",
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
    briefsPerMonth: 60,
    features: ALL,
    monthlyPrice: 999,
    annualPrice: 9990,
    highlights: [
      "Unlimited initiatives",
      "60 AI build briefs / month",
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
    briefsPerMonth: null,
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

/* ───────────────────────────── Self-serve billing helpers ───────────────────────────── */

export const SELF_SERVE_PLANS = ["team", "business"] as const satisfies readonly SelfServePlan[];
export const BILLING_INTERVALS = ["month", "year"] as const satisfies readonly BillingInterval[];

export const isSelfServePlan = (v: unknown): v is SelfServePlan => v === "team" || v === "business";
export const isBillingInterval = (v: unknown): v is BillingInterval => v === "month" || v === "year";

/** Short label for a DB plan value (badges, admin tables). */
export function planLabel(dbPlan: DbPlan | string | null | undefined): string {
  if (dbPlan === "enterprise") return "Enterprise";
  if (dbPlan === "engagement") return "Managed";
  return planFor(dbPlan).name;
}

/** List price for one billing period of a self-serve plan, in USD. */
export const listPrice = (plan: SelfServePlan, interval: BillingInterval): number =>
  interval === "year" ? PLANS[plan].annualPrice : PLANS[plan].monthlyPrice;

/** What paying annually saves versus twelve monthly payments (USD/year). */
export const annualSavings = (plan: SelfServePlan): number => PLANS[plan].monthlyPrice * 12 - PLANS[plan].annualPrice;

/**
 * Monthly recurring revenue contributed by a workspace at list price: monthly price, or the annual
 * price ÷ 12. Zero for Free, managed (invoiced by North Labs) and unknown plans.
 */
export function mrrFor(dbPlan: DbPlan | string, interval: BillingInterval | string | null | undefined): number {
  const plan = dbPlan === "pro" ? "business" : dbPlan;
  if (!isSelfServePlan(plan)) return 0;
  return interval === "year" ? PLANS[plan].annualPrice / 12 : PLANS[plan].monthlyPrice;
}

/** Plan ranking for "is this an upgrade?" comparisons. Managed sits above everything. */
export function planRank(dbPlan: DbPlan | string | null | undefined): number {
  return { free: 0, team: 1, business: 2, managed: 3 }[planFor(dbPlan).id];
}

/** The next self-serve plan up (for upsells), or null at the top. */
export function nextPlan(dbPlan: DbPlan | string): PlanDefinition | null {
  const id = planFor(dbPlan).id;
  return id === "free" ? PLANS.team : id === "team" ? PLANS.business : null;
}

export const FEATURE_LABELS: Record<Feature, { name: string; description: string }> = {
  intake_link: { name: "Company-wide idea intake link", description: "A shareable link anyone at your company can use to submit AI ideas, no account needed." },
  export_csv: { name: "Portfolio CSV export", description: "Download the prioritized portfolio with impact, costs and data dependencies." },
  mcp_workspace: { name: "Workspace tools over MCP", description: "Query initiatives, ideas and impact from Claude, Cursor or ChatGPT." },
  mcp_write: { name: "MCP write access", description: "Submit ideas and record impact from your AI assistant." },
  governance_workflow: { name: "Governance approvals", description: "Review requests, approvals, an approval gate before pilot / production and review reminders." },
  governance_export: { name: "AI use-case inventory export", description: "An auditor-ready CSV of every AI use case, its risk tier, oversight and approval." },
};

/** User-facing error when a server action needs a feature the workspace's plan doesn't include. */
export function featureGateMessage(dbPlan: DbPlan | string, feature: Feature): string {
  const needed = planForFeature(feature);
  return `${FEATURE_LABELS[feature].name} is available on the ${needed.name} plan and above. This workspace is on ${planFor(dbPlan).name}; an owner or admin can upgrade in Plan & billing.`;
}

/** Briefs allowed per rolling 30 days, or null for unlimited. */
export const briefsPerMonth = (dbPlan: DbPlan | string) => planFor(dbPlan).briefsPerMonth;
