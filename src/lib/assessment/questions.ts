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
    description: "A clear goal for AI, a leader in charge of it, and money tied to business goals.",
  },
  {
    id: "value",
    label: "Use cases & value",
    short: "Use cases",
    description: "How you find, pick and measure the AI projects that help the business most.",
  },
  {
    id: "data",
    label: "Data readiness",
    short: "Data",
    description: "Whether AI can get the data and documents it needs, and whether someone owns them.",
  },
  {
    id: "technology",
    label: "Technology & platforms",
    short: "Technology",
    description: "The AI tools people can use safely, and how easily AI connects to your other systems.",
  },
  {
    id: "people",
    label: "People & skills",
    short: "People",
    description: "How much people know about AI, who can build with it, and how they feel about change.",
  },
  {
    id: "governance",
    label: "Rules & safety",
    short: "Governance",
    description: "The rules, safety checks and reviews that let you use more AI, safely.",
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
    prompt: "Does your company have a written plan for AI?",
    options: opts(
      "No, leaders don't talk about AI yet",
      "Leaders talk about it, but nothing is written down",
      "A few teams have their own AI plans",
      "A written plan tied to business goals",
      "A plan with goals and owners that leaders review often",
    ),
  },
  {
    id: "strategy_owner",
    dimension: "strategy",
    prompt: "Which leader is in charge of AI results?",
    options: opts(
      "No one",
      "IT handles it, as a question about tools",
      "A leader who cares about it, on top of their main job",
      "A named leader with a budget",
      "A named leader, plus a group from across the company that sets priorities",
    ),
  },
  {
    id: "strategy_funding",
    dimension: "strategy",
    prompt: "How do you pay for AI work?",
    options: opts(
      "We don't pay for it",
      "Now and then, out of each team's own budget",
      "A small budget for trying things out",
      "A set budget for each approved project",
      "One shared budget, split by expected payoff and reviewed often",
    ),
  },
  // ── Use cases & value ──
  {
    id: "value_adoption",
    dimension: "value",
    prompt: "Where does your company use AI today?",
    options: opts(
      "Nowhere that we know of",
      "A few people try chat tools on their own",
      "One or two small tests",
      "Several projects in daily use in one or two teams",
      "Many projects across teams, with more on the way",
    ),
  },
  {
    id: "value_prioritization",
    dimension: "value",
    prompt: "How do you pick which AI ideas to work on?",
    options: opts(
      "We haven't had to pick yet",
      "Whoever is most excited goes ahead",
      "We talk about how much each idea might help",
      "We score every idea the same way: value, effort and risk",
      "We keep a ranked list and check it against our goals often",
    ),
  },
  {
    id: "value_measurement",
    dimension: "value",
    prompt: "How do you measure what AI work gives back?",
    options: opts(
      "We don't",
      "Stories about what worked",
      "We guess before launch, but don't check afterward",
      "We track some projects (hours saved, costs, sales)",
      "We track every project before and after, and report to leaders",
    ),
  },
  // ── Data readiness ──
  {
    id: "data_access",
    dimension: "data",
    prompt: "How easy is it to get the data your AI projects would need?",
    options: opts(
      "We're not sure where it is",
      "It's spread across spreadsheets, inboxes and separate tools",
      "It's in our main systems, but getting it out takes manual work",
      "Most key data is in well-run systems that other tools can connect to",
      "One central, documented place where people can get data themselves",
    ),
  },
  {
    id: "data_quality",
    dimension: "data",
    prompt: "How good is your data, and does someone own it?",
    options: opts(
      "We don't know",
      "We know it has problems, and no one owns it",
      "Some data has owners, but quality varies a lot",
      "Key data has owners, and someone checks its quality",
      "Clear owners, shared definitions and quality goals for all key data",
    ),
  },
  {
    id: "data_knowledge",
    dimension: "data",
    prompt: "Could AI find and use your documents (policies, contracts, how-to guides)?",
    options: opts(
      "They're mostly on paper or in personal folders",
      "In shared folders, but not well organized",
      "In one central place that isn't kept up to date",
      "In one well-organized place with the right access rules",
      "Well kept, with access rules, and already connected to AI tools",
    ),
  },
  // ── Technology & platforms ──
  {
    id: "tech_tools",
    dimension: "technology",
    prompt: "Which AI tools can employees use?",
    options: opts(
      "None, or AI tools are blocked",
      "People use their own personal accounts",
      "One approved AI assistant for some staff",
      "Company AI tools for most staff, with secure sign-in and data protection",
      "Company AI tools, plus a way to build our own AI apps and agents",
    ),
  },
  {
    id: "tech_integration",
    dimension: "technology",
    prompt: "How easily can AI connect to your main business systems?",
    options: opts(
      "It can't today",
      "Only by copying and pasting",
      "A few one-off connections",
      "Standard connections that we reuse",
      "One shared AI setup with connections, testing and monitoring",
    ),
  },
  // ── People & skills ──
  {
    id: "people_literacy",
    dimension: "people",
    prompt: "How much do employees know about AI?",
    options: opts(
      "Very little",
      "A few people taught themselves",
      "Training is offered, but it's optional",
      "Training for each role, for most employees",
      "Ongoing training, AI helpers in each team, and AI built into daily work",
    ),
  },
  {
    id: "people_skills",
    dimension: "people",
    prompt: "Do you have the skills to build and run AI tools?",
    options: opts(
      "No",
      "We'd hire outside firms, one project at a time",
      "A few people have some of the skills",
      "A small team of our own, or a partner we trust",
      "A full team, plus builders inside each department",
    ),
  },
  {
    id: "people_culture",
    dimension: "people",
    prompt: "How do employees feel about AI changing their work?",
    options: opts(
      "Against it, or worried",
      "Unsure. We haven't talked about it openly",
      "Curious, but careful",
      "Mostly positive, and leaders talk about it openly",
      "They suggest and lead AI improvements themselves",
    ),
  },
  // ── Rules & safety ──
  {
    id: "gov_policy",
    dimension: "governance",
    prompt: "Do you have rules for how employees may use AI?",
    options: opts(
      "No",
      "Only informal advice",
      "A draft, or rules that cover only part of it",
      "Written rules that employees agree to",
      "Rules that our approved tools and settings enforce",
    ),
  },
  {
    id: "gov_risk",
    dimension: "governance",
    prompt: "How do you check AI projects for risks (privacy, security, bias, laws)?",
    options: opts(
      "We don't",
      "Only when someone raises a concern",
      "Security or legal checks for big projects",
      "A standard check for every project, sorted by how risky it is",
      "Risk levels, rules for human checks, and regular re-checks of AI in use",
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
