/**
 * The shared vocabulary for the Radar feed and the Workspace.
 * Stories are tagged with these slugs; users subscribe to them; initiatives reference vendors.
 */

export type Option = { slug: string; label: string; description?: string };

export const CATEGORIES = [
  { slug: "model_release", label: "Model releases", description: "New models, versions and capability jumps" },
  { slug: "product_launch", label: "Products & features", description: "New AI products, features and integrations" },
  { slug: "pricing", label: "Pricing changes", description: "Price cuts, new tiers, licensing changes" },
  { slug: "deprecation", label: "Deprecations & retirements", description: "Models or APIs being retired or changed" },
  { slug: "agents", label: "Agents & automation", description: "Agentic tooling, workflow automation, computer use" },
  { slug: "enterprise", label: "Enterprise adoption", description: "Case studies, deployments, partnerships" },
  { slug: "regulation", label: "Policy & regulation", description: "Laws, executive orders, compliance frameworks" },
  { slug: "security", label: "Security & safety", description: "Incidents, vulnerabilities, safety research" },
  { slug: "research", label: "Research", description: "Papers, benchmarks and technical breakthroughs" },
  { slug: "open_source", label: "Open source", description: "Open-weight models and open-source tooling" },
  { slug: "funding", label: "Funding & M&A", description: "Raises, acquisitions and market moves" },
  { slug: "infrastructure", label: "Chips & infrastructure", description: "GPUs, data centers, cloud capacity" },
] as const satisfies readonly Option[];

export const VENDORS = [
  { slug: "anthropic", label: "Anthropic" },
  { slug: "openai", label: "OpenAI" },
  { slug: "google", label: "Google" },
  { slug: "microsoft", label: "Microsoft" },
  { slug: "meta", label: "Meta" },
  { slug: "amazon", label: "Amazon / AWS" },
  { slug: "nvidia", label: "NVIDIA" },
  { slug: "mistral", label: "Mistral" },
  { slug: "xai", label: "xAI" },
  { slug: "apple", label: "Apple" },
  { slug: "salesforce", label: "Salesforce" },
  { slug: "databricks", label: "Databricks" },
  { slug: "snowflake", label: "Snowflake" },
  { slug: "huggingface", label: "Hugging Face" },
  { slug: "cohere", label: "Cohere" },
  { slug: "deepseek", label: "DeepSeek" },
  { slug: "perplexity", label: "Perplexity" },
  { slug: "ibm", label: "IBM" },
] as const satisfies readonly Option[];

export const INDUSTRIES = [
  { slug: "financial_services", label: "Financial services" },
  { slug: "healthcare", label: "Healthcare & life sciences" },
  { slug: "manufacturing", label: "Manufacturing" },
  { slug: "retail", label: "Retail & consumer" },
  { slug: "legal", label: "Legal & professional services" },
  { slug: "public_sector", label: "Public sector" },
  { slug: "energy", label: "Energy & utilities" },
  { slug: "media", label: "Media & marketing" },
  { slug: "technology", label: "Technology & software" },
  { slug: "education", label: "Education" },
  { slug: "logistics", label: "Transportation & logistics" },
  { slug: "insurance", label: "Insurance" },
] as const satisfies readonly Option[];

export const COMPANY_SIZES = ["1–50", "51–200", "201–1,000", "1,001–5,000", "5,001+"] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export type VendorSlug = (typeof VENDORS)[number]["slug"];
export type IndustrySlug = (typeof INDUSTRIES)[number]["slug"];

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as CategorySlug[];
export const VENDOR_SLUGS = VENDORS.map((v) => v.slug) as VendorSlug[];
export const INDUSTRY_SLUGS = INDUSTRIES.map((i) => i.slug) as IndustrySlug[];

const index = (list: readonly Option[]) => new Map(list.map((o) => [o.slug, o.label]));
const categoryLabels = index(CATEGORIES);
const vendorLabels = index(VENDORS);
const industryLabels = index(INDUSTRIES);

export const categoryLabel = (slug: string) => categoryLabels.get(slug) ?? slug;
export const vendorLabel = (slug: string) => vendorLabels.get(slug) ?? slug;
export const industryLabel = (slug: string) => industryLabels.get(slug) ?? slug;

/** Categories that, when they hit a vendor an initiative depends on, raise an initiative alert. */
export const ALERT_CATEGORIES: CategorySlug[] = [
  "pricing",
  "deprecation",
  "security",
  "model_release",
  "regulation",
];

/* ───────────────────────────── Workspace vocab ───────────────────────────── */

export const STAGES = [
  { slug: "idea", label: "Idea" },
  { slug: "evaluating", label: "Evaluating" },
  { slug: "building", label: "Building" },
  { slug: "pilot", label: "Pilot" },
  { slug: "production", label: "Production" },
  { slug: "retired", label: "Retired" },
] as const;

export const HEALTH = [
  { slug: "on_track", label: "On track" },
  { slug: "at_risk", label: "At risk" },
  { slug: "blocked", label: "Blocked" },
] as const;

export const BUILD_APPROACHES = [
  { slug: "buy", label: "Buy (SaaS)" },
  { slug: "configure", label: "Configure (low-code / copilots)" },
  { slug: "build", label: "Build (custom)" },
  { slug: "partner", label: "Partner-built" },
] as const;

export const SYSTEM_CATEGORIES = [
  { slug: "crm", label: "CRM" },
  { slug: "erp", label: "ERP" },
  { slug: "data_warehouse", label: "Data warehouse / lake" },
  { slug: "database", label: "Operational database" },
  { slug: "document_store", label: "Documents & knowledge" },
  { slug: "hris", label: "HRIS" },
  { slug: "ticketing", label: "Ticketing / ITSM" },
  { slug: "communication", label: "Email & chat" },
  { slug: "finance", label: "Finance & accounting" },
  { slug: "marketing", label: "Marketing" },
  { slug: "custom_app", label: "Custom application" },
  { slug: "other", label: "Other" },
] as const;

export const ACCESS_STATUSES = [
  { slug: "not_requested", label: "Not requested" },
  { slug: "requested", label: "Requested" },
  { slug: "granted", label: "Granted" },
  { slug: "blocked", label: "Blocked" },
] as const;

export const SENSITIVITIES = [
  { slug: "public", label: "Public" },
  { slug: "internal", label: "Internal" },
  { slug: "confidential", label: "Confidential" },
  { slug: "pii", label: "PII" },
  { slug: "phi", label: "PHI" },
  { slug: "pci", label: "PCI" },
] as const;

export const METRIC_TYPES = [
  { slug: "hours_saved", label: "Hours saved", unit: "hours" },
  { slug: "cost_saved", label: "Cost saved", unit: "usd" },
  { slug: "revenue_generated", label: "Revenue generated", unit: "usd" },
  { slug: "custom", label: "Custom metric", unit: "" },
] as const;

export const METRIC_PERIODS = [
  { slug: "monthly", label: "per month" },
  { slug: "annual", label: "per year" },
  { slug: "one_time", label: "one-time" },
] as const;

export const ORG_ROLES = [
  { slug: "owner", label: "Owner", description: "Full control, including members and workspace settings" },
  { slug: "admin", label: "Admin", description: "Manage members, settings and all content" },
  { slug: "editor", label: "Editor", description: "Create and edit initiatives, systems and impact data" },
  { slug: "viewer", label: "Viewer", description: "Read-only access to the portfolio" },
] as const;

export const labelFrom = (list: readonly { slug: string; label: string }[], slug: string | null | undefined) =>
  list.find((o) => o.slug === slug)?.label ?? slug ?? "—";

/* ───────────────────────────── Governance ───────────────────────────── */

export const RISK_TIERS = [
  { slug: "unclassified", label: "Unclassified", description: "Not yet assessed" },
  { slug: "minimal", label: "Minimal risk", description: "Internal productivity, no decisions about people, no sensitive data" },
  { slug: "limited", label: "Limited risk", description: "Customer-facing or generated content; needs transparency to users" },
  { slug: "high", label: "High risk", description: "Decisions affecting people's rights, safety, employment, credit, health or education" },
  { slug: "prohibited", label: "Prohibited", description: "Uses the company (or regulation) does not allow" },
] as const;

export const HUMAN_OVERSIGHT_LEVELS = [
  { slug: "none", label: "Fully automated" },
  { slug: "spot_check", label: "Spot-checked by people" },
  { slug: "review_all", label: "Every output reviewed" },
  { slug: "human_decides", label: "AI assists, a person decides" },
] as const;

export const APPROVAL_STATUSES = [
  { slug: "not_submitted", label: "Not submitted" },
  { slug: "pending", label: "Pending review" },
  { slug: "approved", label: "Approved" },
  { slug: "conditional", label: "Approved with conditions" },
  { slug: "rejected", label: "Not approved" },
] as const;

/* ───────────────────────────── Idea intake ───────────────────────────── */

export const IDEA_STATUSES = [
  { slug: "new", label: "New" },
  { slug: "under_review", label: "Under review" },
  { slug: "accepted", label: "Accepted" },
  { slug: "declined", label: "Declined" },
  { slug: "duplicate", label: "Duplicate" },
] as const;

export const IDEA_URGENCY = [
  { slug: "low", label: "Nice to have" },
  { slug: "medium", label: "Important" },
  { slug: "high", label: "Urgent" },
] as const;

/** Free workspaces (plan "trial") are capped; see src/lib/plans.ts for all plan limits. */
export const TRIAL_INITIATIVE_LIMIT = 5;
