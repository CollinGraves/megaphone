/**
 * AI Readiness Assessment: question bank and context vocabulary.
 * Pure module (no server imports) so the questionnaire can render it client-side.
 */
import { VENDORS, type VendorSlug } from "@/lib/taxonomy";

export const DIMENSIONS = [
  {
    id: "strategy",
    label: "Strategy & leadership",
    short: "Strategy",
    description: "Whether AI has a clear purpose, an accountable owner and funding tied to business goals.",
  },
  {
    id: "value",
    label: "Use cases & value",
    short: "Use cases",
    description: "How you find, prioritize and measure AI use cases that move the business.",
  },
  {
    id: "data",
    label: "Data readiness",
    short: "Data",
    description: "Whether the data and knowledge AI needs is accessible, trustworthy and owned.",
  },
  {
    id: "technology",
    label: "Technology & platforms",
    short: "Technology",
    description: "The AI tools people can use safely, and how easily AI connects to your systems.",
  },
  {
    id: "people",
    label: "People & skills",
    short: "People",
    description: "AI literacy across the workforce, the skills to build, and appetite for change.",
  },
  {
    id: "governance",
    label: "Governance & risk",
    short: "Governance",
    description: "Policies, risk review and oversight that let you scale AI responsibly.",
  },
] as const;

export type DimensionId = (typeof DIMENSIONS)[number]["id"];
export const DIMENSION_IDS = DIMENSIONS.map((d) => d.id) as DimensionId[];
export const dimensionLabel = (id: string) => DIMENSIONS.find((d) => d.id === id)?.label ?? id;

export type QuestionOption = { label: string; score: 0 | 1 | 2 | 3 | 4 };
export type Question = { id: string; dimension: DimensionId; prompt: string; help?: string; options: QuestionOption[] };

/** Options are listed from least to most mature; the stored answer is the option index. */
const opts = (...labels: [string, string, string, string, string]): QuestionOption[] =>
  labels.map((label, i) => ({ label, score: i as QuestionOption["score"] }));

export const QUESTIONS: Question[] = [
  // ── Strategy & leadership ──
  {
    id: "strategy_plan",
    dimension: "strategy",
    prompt: "Does your company have a defined AI strategy?",
    options: opts(
      "No, AI isn't a leadership topic yet",
      "It's discussed informally, but nothing is written down",
      "A few teams have their own AI plans",
      "A documented strategy tied to business goals",
      "A strategy with targets and owners, reviewed regularly by the executive team",
    ),
  },
  {
    id: "strategy_owner",
    dimension: "strategy",
    prompt: "Who owns AI outcomes at the leadership level?",
    options: opts(
      "No one",
      "IT handles it as a tooling question",
      "An enthusiastic leader champions it alongside their day job",
      "A named executive sponsor with a budget",
      "An executive sponsor plus a cross-functional group that sets priorities",
    ),
  },
  {
    id: "strategy_funding",
    dimension: "strategy",
    prompt: "How is AI work funded?",
    options: opts(
      "It isn't funded",
      "Ad hoc, out of individual team budgets",
      "A small innovation budget for experiments",
      "Dedicated budget for each approved initiative",
      "A portfolio budget, allocated by expected return and reviewed regularly",
    ),
  },
  // ── Use cases & value ──
  {
    id: "value_adoption",
    dimension: "value",
    prompt: "Where is AI in use today?",
    options: opts(
      "Nowhere that we know of",
      "Individuals experimenting with chat assistants",
      "One or two pilots",
      "Several use cases in production in one or two functions",
      "Many use cases across functions, with a pipeline of more",
    ),
  },
  {
    id: "value_prioritization",
    dimension: "value",
    prompt: "How do you decide which AI ideas to pursue?",
    options: opts(
      "We haven't had to decide yet",
      "Whoever is most enthusiastic goes ahead",
      "Informal discussion of the likely value",
      "A consistent scoring of value, feasibility and risk",
      "A prioritized portfolio, reviewed regularly against strategy",
    ),
  },
  {
    id: "value_measurement",
    dimension: "value",
    prompt: "How do you measure the impact of AI work?",
    options: opts(
      "We don't",
      "Anecdotes and success stories",
      "Estimates before launch, not tracked afterwards",
      "Tracked for some initiatives (hours saved, cost, revenue)",
      "Baselines and actuals for every initiative, reported to leadership",
    ),
  },
  // ── Data readiness ──
  {
    id: "data_access",
    dimension: "data",
    prompt: "How accessible is the data your AI use cases would need?",
    options: opts(
      "We're not sure where it lives",
      "Scattered across spreadsheets, inboxes and siloed tools",
      "In core systems, but getting it out means manual exports",
      "Most key data sits in governed systems with APIs or a warehouse",
      "A central, documented data platform with self-service access",
    ),
  },
  {
    id: "data_quality",
    dimension: "data",
    prompt: "How would you describe data quality and ownership?",
    options: opts(
      "Unknown",
      "Known quality problems and no clear owners",
      "Some owners; quality varies a lot",
      "Owners for key datasets, with quality monitored",
      "Formal data governance: owners, shared definitions and quality targets",
    ),
  },
  {
    id: "data_knowledge",
    dimension: "data",
    prompt: "Could AI find and use your documents and know-how (policies, contracts, procedures)?",
    options: opts(
      "Mostly on paper or personal drives",
      "Shared drives, organized inconsistently",
      "A central repository that is poorly maintained",
      "A well-organized repository with the right permissions",
      "Curated, permissioned knowledge already connected to AI tools",
    ),
  },
  // ── Technology & platforms ──
  {
    id: "tech_tools",
    dimension: "technology",
    prompt: "Which AI tools are available to employees?",
    options: opts(
      "None, or AI tools are blocked",
      "People use personal accounts",
      "One approved assistant for some staff",
      "Enterprise AI tools for most staff, with single sign-on and data protections",
      "Enterprise tools plus a platform for building our own AI apps and agents",
    ),
  },
  {
    id: "tech_integration",
    dimension: "technology",
    prompt: "How easily can AI connect to your core business systems?",
    options: opts(
      "It can't today",
      "Only by copying and pasting",
      "A few one-off integrations",
      "Standard integration patterns (APIs, connectors) that we reuse",
      "A shared AI platform with connectors, evaluation and monitoring",
    ),
  },
  // ── People & skills ──
  {
    id: "people_literacy",
    dimension: "people",
    prompt: "How AI-literate is your workforce?",
    options: opts(
      "Little awareness",
      "A handful of self-taught enthusiasts",
      "Optional training is available",
      "Role-based training for most employees",
      "Ongoing training, a champions network and AI built into how roles work",
    ),
  },
  {
    id: "people_skills",
    dimension: "people",
    prompt: "Do you have the skills to build and run AI solutions?",
    options: opts(
      "No",
      "We'd rely on vendors, case by case",
      "A few people with some relevant skills",
      "A small dedicated team or a trusted delivery partner",
      "A dedicated team plus builders embedded in business units",
    ),
  },
  {
    id: "people_culture",
    dimension: "people",
    prompt: "How do employees feel about AI changing their work?",
    options: opts(
      "Resistant or anxious",
      "Unsure; it hasn't been discussed openly",
      "Curious but cautious",
      "Generally positive, and leadership communicates openly about it",
      "Actively proposing and leading AI improvements",
    ),
  },
  // ── Governance & risk ──
  {
    id: "gov_policy",
    dimension: "governance",
    prompt: "Do you have an AI acceptable-use policy?",
    options: opts(
      "No",
      "Informal guidance only",
      "A draft or partial policy",
      "A published policy that employees acknowledge",
      "A policy enforced through approved tools and technical controls",
    ),
  },
  {
    id: "gov_risk",
    dimension: "governance",
    prompt: "How are AI use cases reviewed for risk (privacy, security, bias, regulation)?",
    options: opts(
      "They aren't",
      "Case by case, when someone raises a concern",
      "Security or legal review for large projects",
      "A standard risk review, with risk tiers, for every use case",
      "Risk tiers, human-oversight rules and periodic re-review of live AI systems",
    ),
  },
];

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
export const questionsFor = (dimension: DimensionId) => QUESTIONS.filter((q) => q.dimension === dimension);

/* ───────────────────────────── Context questions ───────────────────────────── */

export const ROLES = [
  { slug: "executive", label: "CEO, founder or C-suite" },
  { slug: "vp", label: "VP or head of a function" },
  { slug: "director", label: "Director" },
  { slug: "manager", label: "Manager or team lead" },
  { slug: "individual", label: "Individual contributor or specialist" },
  { slug: "advisor", label: "Board member, consultant or advisor" },
] as const;
export type RoleSlug = (typeof ROLES)[number]["slug"];

export const BUSINESS_FUNCTIONS = [
  { slug: "customer_service", label: "Customer service" },
  { slug: "sales", label: "Sales" },
  { slug: "marketing", label: "Marketing" },
  { slug: "finance", label: "Finance & accounting" },
  { slug: "operations", label: "Operations" },
  { slug: "supply_chain", label: "Supply chain & procurement" },
  { slug: "hr", label: "HR & people" },
  { slug: "it", label: "IT & internal support" },
  { slug: "legal", label: "Legal, risk & compliance" },
  { slug: "product", label: "Product & engineering" },
] as const;
export type FunctionSlug = (typeof BUSINESS_FUNCTIONS)[number]["slug"];
export const MAX_FUNCTIONS = 3;

/** AI tools people recognize, mapped onto taxonomy vendor slugs (so they become initiative platforms). */
export const AI_TOOLS: { slug: VendorSlug; label: string }[] = [
  { slug: "openai", label: "ChatGPT / OpenAI" },
  { slug: "microsoft", label: "Microsoft Copilot" },
  { slug: "anthropic", label: "Claude / Anthropic" },
  { slug: "google", label: "Gemini / Google" },
  { slug: "amazon", label: "Amazon Bedrock / Q" },
  { slug: "salesforce", label: "Salesforce Agentforce" },
  { slug: "meta", label: "Llama (Meta)" },
  { slug: "mistral", label: "Mistral" },
  { slug: "databricks", label: "Databricks" },
  { slug: "snowflake", label: "Snowflake Cortex" },
  { slug: "perplexity", label: "Perplexity" },
  { slug: "ibm", label: "IBM watsonx" },
];
// Every tool must be a known vendor slug.
const vendorSlugs = new Set<string>(VENDORS.map((v) => v.slug));
for (const t of AI_TOOLS) if (!vendorSlugs.has(t.slug)) throw new Error(`Unknown AI tool vendor: ${t.slug}`);

export const AI_TOOL_SLUGS = AI_TOOLS.map((t) => t.slug);

const labelOf = (list: readonly { slug: string; label: string }[], slug: string) => list.find((o) => o.slug === slug)?.label ?? slug;
export const roleLabel = (slug: string) => labelOf(ROLES, slug);
export const functionLabel = (slug: string) => labelOf(BUSINESS_FUNCTIONS, slug);
export const toolLabel = (slug: string) => labelOf(AI_TOOLS, slug);
