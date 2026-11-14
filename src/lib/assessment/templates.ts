/**
 * Starter-initiative template library. Used to suggest initiatives in the report and to pre-fill a
 * free starter workspace. Value is described qualitatively on purpose: no invented benchmarks or
 * dollar figures. Suggested 1–5 scores are starting points the customer is expected to adjust.
 */
import type { IndustrySlug, VendorSlug } from "@/lib/taxonomy";
import { AI_TOOL_SLUGS, functionLabel, type FunctionSlug } from "./questions";

export type Effort = "Low" | "Medium" | "High";

export type StarterTemplate = {
  id: string;
  title: string;
  /** Business function, or "cross_functional" for templates that fit any function. */
  function: FunctionSlug | "cross_functional";
  /** When set, the template is only suggested to these industries. */
  industries?: IndustrySlug[];
  problem: string;
  solution: string;
  valueDrivers: string[];
  effort: Effort;
  scores: { value: number; feasibility: number; alignment: number; risk: number };
  buildApproach: "buy" | "configure" | "build" | "partner";
  customerFacing: boolean;
  /** Vendors whose products are a natural fit (e.g. a CRM-native use case). */
  platformHints?: VendorSlug[];
};

const t = (x: StarterTemplate) => x;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // ── Cross-functional ──
  t({
    id: "knowledge_assistant",
    title: "Internal knowledge assistant",
    function: "cross_functional",
    problem: "Employees spend time hunting for policies, procedures and past answers spread across drives and wikis.",
    solution: "An AI assistant that answers questions from approved internal documents, with citations and permissions respected.",
    valueDrivers: ["Less time searching for information", "Faster onboarding of new hires", "More consistent answers"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
  }),
  t({
    id: "meeting_summaries",
    title: "Meeting notes and follow-up automation",
    function: "cross_functional",
    problem: "Action items from meetings get lost and people spend time writing up notes by hand.",
    solution: "Use the AI features of your meeting and productivity tools to draft summaries, decisions and follow-ups.",
    valueDrivers: ["Time back for managers and teams", "Fewer dropped action items", "Better records of decisions"],
    effort: "Low",
    scores: { value: 2, feasibility: 5, alignment: 3, risk: 2 },
    buildApproach: "buy",
    customerFacing: false,
  }),
  // ── Customer service ──
  t({
    id: "cs_agent_assist",
    title: "Agent assist for customer support",
    function: "customer_service",
    problem: "Support agents switch between systems to find answers and write replies, which slows resolution.",
    solution: "Suggest draft replies and relevant knowledge articles inside the ticketing tool; agents review before sending.",
    valueDrivers: ["Faster handling time", "More consistent answers", "Quicker ramp-up for new agents"],
    effort: "Medium",
    scores: { value: 4, feasibility: 4, alignment: 4, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
    platformHints: ["salesforce", "microsoft"],
  }),
  t({
    id: "cs_triage",
    title: "Ticket triage and routing",
    function: "customer_service",
    problem: "Incoming requests are categorized and routed by hand, so urgent issues can wait in the wrong queue.",
    solution: "Classify incoming tickets by topic, urgency and sentiment, and route them to the right team automatically.",
    valueDrivers: ["Faster first response on urgent issues", "Less manual sorting", "Better visibility into demand"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
    platformHints: ["salesforce"],
  }),
  t({
    id: "cs_self_service",
    title: "Customer self-service assistant",
    function: "customer_service",
    problem: "Customers wait for answers to common questions that are already documented.",
    solution: "A customer-facing assistant that answers from approved help content and hands off to a person when unsure.",
    valueDrivers: ["24/7 answers to routine questions", "Agents focus on complex cases", "Shorter queues"],
    effort: "High",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 4 },
    buildApproach: "build",
    customerFacing: true,
  }),
  // ── Sales ──
  t({
    id: "sales_account_research",
    title: "Account research and meeting prep",
    function: "sales",
    problem: "Sellers spend hours researching accounts and preparing for meetings instead of selling.",
    solution: "Generate account briefs from CRM history, public news and past interactions before each meeting.",
    valueDrivers: ["More selling time", "Better-prepared conversations", "Consistent account knowledge"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 4, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
    platformHints: ["salesforce", "microsoft"],
  }),
  t({
    id: "sales_crm_hygiene",
    title: "Call summaries and CRM updates",
    function: "sales",
    problem: "CRM data is incomplete because updating it after every call is tedious.",
    solution: "Summarize calls and propose CRM field updates and next steps for the seller to confirm.",
    valueDrivers: ["More complete pipeline data", "Less admin for sellers", "Better forecasting inputs"],
    effort: "Medium",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
    platformHints: ["salesforce", "microsoft"],
  }),
  t({
    id: "sales_proposals",
    title: "Proposal and RFP response drafting",
    function: "sales",
    problem: "Proposals and security questionnaires are assembled by hand from old documents.",
    solution: "Draft first-pass responses from an approved library of past answers, for subject experts to review.",
    valueDrivers: ["Faster turnaround on bids", "Capacity to respond to more opportunities", "More consistent messaging"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 2 },
    buildApproach: "build",
    customerFacing: false,
  }),
  // ── Marketing ──
  t({
    id: "mkt_content",
    title: "On-brand content production",
    function: "marketing",
    problem: "Producing variations of campaign content for each channel and audience is slow.",
    solution: "Generate first drafts and channel variants from briefs, using brand guidelines, with human review.",
    valueDrivers: ["Faster campaign launches", "More testing of variations", "Consistent brand voice"],
    effort: "Low",
    scores: { value: 3, feasibility: 5, alignment: 3, risk: 2 },
    buildApproach: "buy",
    customerFacing: false,
  }),
  t({
    id: "mkt_insights",
    title: "Customer feedback insights",
    function: "marketing",
    problem: "Reviews, surveys and support conversations contain insight nobody has time to read.",
    solution: "Cluster and summarize customer feedback into themes, trends and quotes each month.",
    valueDrivers: ["Clearer view of customer needs", "Faster detection of emerging issues", "Better-informed roadmaps"],
    effort: "Medium",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "build",
    customerFacing: false,
  }),
  // ── Finance ──
  t({
    id: "fin_invoices",
    title: "Invoice and expense exception handling",
    function: "finance",
    problem: "Finance teams manually review invoices and expenses that don't match purchase orders or policy.",
    solution: "Extract invoice data, flag exceptions with an explanation, and route them for approval.",
    valueDrivers: ["Less manual matching", "Faster close", "Fewer payment errors"],
    effort: "Medium",
    scores: { value: 4, feasibility: 4, alignment: 4, risk: 3 },
    buildApproach: "configure",
    customerFacing: false,
  }),
  t({
    id: "fin_reporting",
    title: "Management reporting commentary",
    function: "finance",
    problem: "Analysts spend days each month writing variance commentary for management reports.",
    solution: "Draft variance explanations from the numbers and notes, for analysts to verify and refine.",
    valueDrivers: ["Faster month-end reporting", "More analyst time for analysis", "Consistent commentary"],
    effort: "Medium",
    scores: { value: 3, feasibility: 3, alignment: 4, risk: 3 },
    buildApproach: "build",
    customerFacing: false,
    platformHints: ["microsoft"],
  }),
  t({
    id: "fin_collections",
    title: "Collections prioritization and outreach",
    function: "finance",
    problem: "Collectors work overdue accounts in a fixed order and write reminders by hand.",
    solution: "Prioritize overdue accounts by risk and draft tailored reminder emails for review.",
    valueDrivers: ["Improved cash collection", "Less manual follow-up", "Better customer tone"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 3, risk: 3 },
    buildApproach: "build",
    customerFacing: true,
  }),
  // ── Operations ──
  t({
    id: "ops_document_processing",
    title: "Document intake and data extraction",
    function: "operations",
    problem: "Forms, orders and documents arrive by email and are re-keyed into systems by hand.",
    solution: "Extract structured data from incoming documents, validate it, and queue it for a quick human check.",
    valueDrivers: ["Less re-keying", "Fewer data-entry errors", "Faster processing times"],
    effort: "Medium",
    scores: { value: 4, feasibility: 4, alignment: 4, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
  }),
  t({
    id: "ops_sop_assistant",
    title: "Standard operating procedure assistant",
    function: "operations",
    problem: "Frontline staff can't quickly find the right procedure, so work varies and errors creep in.",
    solution: "An assistant that answers 'how do I…' questions from current SOPs, with links to the source.",
    valueDrivers: ["More consistent execution", "Faster answers on the floor", "Easier onboarding"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
  }),
  // ── Supply chain & procurement ──
  t({
    id: "sc_supplier_risk",
    title: "Supplier risk monitoring",
    function: "supply_chain",
    problem: "Supplier issues (financial, regulatory, disruption) are often discovered too late.",
    solution: "Monitor news and filings for key suppliers and summarize emerging risks for buyers weekly.",
    valueDrivers: ["Earlier warning of disruption", "Less manual monitoring", "Better-informed sourcing decisions"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 2 },
    buildApproach: "build",
    customerFacing: false,
  }),
  t({
    id: "sc_contract_terms",
    title: "Procurement contract and quote comparison",
    function: "supply_chain",
    problem: "Comparing supplier quotes and contract terms side by side is slow and error-prone.",
    solution: "Extract prices, terms and exceptions from quotes and contracts into a comparison for buyers.",
    valueDrivers: ["Faster sourcing cycles", "Fewer missed terms", "Stronger negotiating position"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
  }),
  // ── HR ──
  t({
    id: "hr_policy_helpdesk",
    title: "HR policy and benefits helpdesk",
    function: "hr",
    problem: "HR teams answer the same policy and benefits questions repeatedly.",
    solution: "An employee-facing assistant that answers from HR policies and hands off sensitive cases to HR.",
    valueDrivers: ["Fewer routine HR tickets", "Instant answers for employees", "Consistent policy interpretation"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
    platformHints: ["microsoft"],
  }),
  t({
    id: "hr_job_descriptions",
    title: "Job description and onboarding content drafting",
    function: "hr",
    problem: "Writing job descriptions and onboarding plans for each role takes recruiter and manager time.",
    solution: "Draft inclusive job descriptions and onboarding checklists from role templates for managers to edit.",
    valueDrivers: ["Faster hiring kickoff", "More consistent role definitions", "Better new-hire experience"],
    effort: "Low",
    scores: { value: 2, feasibility: 5, alignment: 3, risk: 2 },
    buildApproach: "buy",
    customerFacing: false,
  }),
  // ── IT ──
  t({
    id: "it_service_desk",
    title: "IT service desk assistant",
    function: "it",
    problem: "Password resets, access requests and how-to questions consume service desk capacity.",
    solution: "Resolve common IT requests through a chat assistant connected to the knowledge base and ITSM tool.",
    valueDrivers: ["Fewer routine tickets", "Faster resolution for employees", "Service desk focus on harder issues"],
    effort: "Medium",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
    platformHints: ["microsoft"],
  }),
  t({
    id: "it_shadow_ai",
    title: "Approved AI assistant rollout",
    function: "it",
    problem: "Employees use personal AI accounts, creating data-leakage risk and no visibility.",
    solution: "Roll out an enterprise AI assistant with single sign-on, data protections and usage reporting.",
    valueDrivers: ["Lower data-leakage risk", "Visibility into AI use", "Productivity gains for everyone"],
    effort: "Low",
    scores: { value: 3, feasibility: 5, alignment: 4, risk: 1 },
    buildApproach: "buy",
    customerFacing: false,
  }),
  // ── Legal ──
  t({
    id: "legal_contract_review",
    title: "Contract review against playbook",
    function: "legal",
    problem: "Lawyers spend time on first-pass review of routine contracts like NDAs and vendor agreements.",
    solution: "Compare incoming contracts with your playbook, flag deviations and suggest fallback language.",
    valueDrivers: ["Faster contract turnaround", "Lawyer time on higher-risk matters", "Consistent positions"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 3 },
    buildApproach: "buy",
    customerFacing: false,
  }),
  t({
    id: "legal_reg_watch",
    title: "Regulatory change monitoring",
    function: "legal",
    problem: "Tracking regulatory changes across jurisdictions is manual and easy to miss.",
    solution: "Monitor regulator publications and summarize what changed and which teams it affects.",
    valueDrivers: ["Earlier awareness of obligations", "Less manual monitoring", "Clear ownership of follow-ups"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 3, risk: 2 },
    buildApproach: "build",
    customerFacing: false,
  }),
  // ── Product & engineering ──
  t({
    id: "eng_coding_assistant",
    title: "AI coding assistant rollout",
    function: "product",
    problem: "Engineers spend significant time on boilerplate, tests and understanding unfamiliar code.",
    solution: "Roll out an approved coding assistant with usage guidelines, code-review rules and adoption tracking.",
    valueDrivers: ["Faster delivery", "More test coverage", "Quicker onboarding to codebases"],
    effort: "Low",
    scores: { value: 4, feasibility: 5, alignment: 4, risk: 2 },
    buildApproach: "buy",
    customerFacing: false,
  }),
  t({
    id: "eng_ai_feature",
    title: "AI feature in your product",
    function: "product",
    problem: "Customers expect AI capabilities in the products they use; competitors are adding them.",
    solution: "Identify one high-value workflow in your product and add an AI-assisted version, with evaluation.",
    valueDrivers: ["Differentiation", "Higher customer engagement", "New pricing opportunities"],
    effort: "High",
    scores: { value: 5, feasibility: 3, alignment: 4, risk: 3 },
    buildApproach: "build",
    customerFacing: true,
  }),
  // ── Industry-specific ──
  t({
    id: "hc_clinical_docs",
    title: "Clinical documentation support",
    function: "operations",
    industries: ["healthcare"],
    problem: "Clinicians spend a large share of their day on documentation instead of patients.",
    solution: "Draft visit notes from clinician dictation or ambient capture, for the clinician to review and sign.",
    valueDrivers: ["More clinician time with patients", "Reduced after-hours documentation", "More complete notes"],
    effort: "High",
    scores: { value: 5, feasibility: 3, alignment: 5, risk: 4 },
    buildApproach: "buy",
    customerFacing: false,
  }),
  t({
    id: "hc_prior_auth",
    title: "Prior authorization packet preparation",
    function: "finance",
    industries: ["healthcare", "insurance"],
    problem: "Assembling prior authorization requests from medical records is slow and causes delays.",
    solution: "Gather the relevant clinical evidence and draft the request for staff to verify and submit.",
    valueDrivers: ["Faster approvals", "Less administrative effort", "Fewer denials for missing information"],
    effort: "High",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 4 },
    buildApproach: "partner",
    customerFacing: false,
  }),
  t({
    id: "fs_kyc",
    title: "KYC and onboarding document review",
    function: "legal",
    industries: ["financial_services", "insurance"],
    problem: "Analysts manually review identity and company documents during customer onboarding.",
    solution: "Extract and cross-check onboarding documents, flagging discrepancies for an analyst decision.",
    valueDrivers: ["Faster onboarding", "More consistent checks", "Analyst focus on true exceptions"],
    effort: "High",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 4 },
    buildApproach: "build",
    customerFacing: false,
  }),
  t({
    id: "ins_claims_intake",
    title: "Claims intake and triage",
    function: "operations",
    industries: ["insurance"],
    problem: "First notice of loss arrives in many formats and is triaged by hand.",
    solution: "Extract claim details, check coverage basics and route claims by complexity to the right handler.",
    valueDrivers: ["Faster claim handling", "Better routing of complex claims", "Improved customer experience"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 5, risk: 3 },
    buildApproach: "build",
    customerFacing: false,
  }),
  t({
    id: "mfg_maintenance",
    title: "Maintenance knowledge assistant",
    function: "operations",
    industries: ["manufacturing", "energy"],
    problem: "Technicians lose time finding the right manual, procedure or past fix for equipment issues.",
    solution: "An assistant that answers from equipment manuals, work orders and past fixes, with sources.",
    valueDrivers: ["Shorter repair times", "Less downtime", "Expert knowledge retained as people retire"],
    effort: "Medium",
    scores: { value: 4, feasibility: 4, alignment: 4, risk: 2 },
    buildApproach: "build",
    customerFacing: false,
  }),
  t({
    id: "mfg_quality",
    title: "Quality issue root-cause analysis",
    function: "operations",
    industries: ["manufacturing"],
    problem: "Quality investigations require digging through inspection notes, logs and reports by hand.",
    solution: "Summarize defect reports and production notes to suggest likely root causes for engineers.",
    valueDrivers: ["Faster investigations", "Fewer repeat defects", "Better use of quality data"],
    effort: "High",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 2 },
    buildApproach: "build",
    customerFacing: false,
  }),
  t({
    id: "retail_product_content",
    title: "Product listing content",
    function: "marketing",
    industries: ["retail"],
    problem: "Writing and updating product descriptions across channels can't keep up with the catalog.",
    solution: "Generate product titles, descriptions and attributes from supplier data and images for review.",
    valueDrivers: ["Faster time to listing", "More complete product data", "Better search visibility"],
    effort: "Low",
    scores: { value: 4, feasibility: 4, alignment: 4, risk: 2 },
    buildApproach: "configure",
    customerFacing: true,
  }),
  t({
    id: "logistics_exceptions",
    title: "Shipment exception management",
    function: "supply_chain",
    industries: ["logistics", "retail", "manufacturing"],
    problem: "Delays and exceptions are spotted late and customers are updated by hand.",
    solution: "Detect shipment exceptions from tracking data, suggest actions and draft customer updates.",
    valueDrivers: ["Earlier intervention", "Fewer inbound 'where is my order' contacts", "Better customer experience"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 2 },
    buildApproach: "build",
    customerFacing: false,
  }),
  t({
    id: "public_inquiries",
    title: "Constituent inquiry assistant",
    function: "customer_service",
    industries: ["public_sector"],
    problem: "Residents struggle to find answers about services, and staff field repetitive inquiries.",
    solution: "An assistant that answers from published service information in plain language and routes complex cases.",
    valueDrivers: ["Better access to services", "Less staff time on routine questions", "Plain-language answers"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 4, risk: 3 },
    buildApproach: "configure",
    customerFacing: true,
  }),
  t({
    id: "edu_course_support",
    title: "Course material and student support",
    function: "product",
    industries: ["education"],
    problem: "Educators spend time creating materials and answering repetitive student questions.",
    solution: "Draft course materials and practice questions, and answer student FAQs from course content.",
    valueDrivers: ["More educator time for teaching", "Faster answers for students", "Richer practice material"],
    effort: "Medium",
    scores: { value: 3, feasibility: 4, alignment: 4, risk: 3 },
    buildApproach: "configure",
    customerFacing: true,
  }),
  t({
    id: "media_repurposing",
    title: "Content repurposing and metadata",
    function: "marketing",
    industries: ["media"],
    problem: "Turning long-form content into clips, summaries and tagged assets is manual.",
    solution: "Generate summaries, social variants and metadata tags from published content for editors to approve.",
    valueDrivers: ["More output from existing content", "Better discoverability", "Editor time on original work"],
    effort: "Low",
    scores: { value: 3, feasibility: 4, alignment: 4, risk: 2 },
    buildApproach: "configure",
    customerFacing: false,
  }),
  t({
    id: "legal_services_research",
    title: "Matter research and drafting support",
    function: "legal",
    industries: ["legal"],
    problem: "Associates spend hours on first drafts and research summaries for routine matters.",
    solution: "Draft research memos and first-pass documents from firm precedents, for lawyer review.",
    valueDrivers: ["Faster first drafts", "More capacity per lawyer", "Better reuse of firm knowledge"],
    effort: "Medium",
    scores: { value: 4, feasibility: 3, alignment: 5, risk: 3 },
    buildApproach: "buy",
    customerFacing: false,
  }),
];

/* ───────────────────────────── Selection ───────────────────────────── */

export type SelectionInput = {
  functions: readonly string[];
  industry?: string | null;
  tools?: readonly string[];
  /** Overall readiness 0–100; lower readiness favors low-effort starters. */
  overall?: number;
};

const EFFORT_FIT = (overall: number): Record<Effort, number> =>
  overall < 40 ? { Low: 1.5, Medium: 0, High: -2 } : overall < 65 ? { Low: 0.5, Medium: 0.5, High: -0.5 } : { Low: 0, Medium: 0.5, High: 0.5 };

/** Same-function picks are penalized so suggestions spread across the functions the user chose. */
const REPEAT_PENALTY = 2;

/**
 * Picks up to `limit` templates for a company: industry-specific templates are only offered to
 * matching industries; templates in the chosen functions (earlier choices weigh more) and in the
 * company's industry rank first; effort is matched to readiness; results spread across functions.
 */
export function selectStarterTemplates(input: SelectionInput, limit = 5): StarterTemplate[] {
  const overall = input.overall ?? 50;
  const effortFit = EFFORT_FIT(overall);
  const fnRank = new Map(input.functions.map((f, i) => [f, i]));

  const candidates = STARTER_TEMPLATES.filter((tpl) => !tpl.industries || (input.industry != null && tpl.industries.includes(input.industry as IndustrySlug)))
    .filter((tpl) => tpl.function === "cross_functional" || fnRank.has(tpl.function))
    .map((tpl, order) => {
      let score = effortFit[tpl.effort] + (tpl.scores.value + tpl.scores.feasibility - tpl.scores.risk) * 0.25;
      if (tpl.function !== "cross_functional") score += 4 - Math.min(2, fnRank.get(tpl.function)!) * 0.5;
      if (tpl.industries) score += 2.5;
      return { tpl, score, order };
    });

  const picked: StarterTemplate[] = [];
  const perFunction = new Map<string, number>();
  while (picked.length < limit && candidates.length) {
    let best = 0;
    const adjusted = (i: number) => candidates[i].score - REPEAT_PENALTY * (perFunction.get(candidates[i].tpl.function) ?? 0);
    for (let i = 1; i < candidates.length; i++) {
      const d = adjusted(i) - adjusted(best);
      if (d > 0 || (d === 0 && candidates[i].order < candidates[best].order)) best = i;
    }
    const [{ tpl }] = candidates.splice(best, 1);
    picked.push(tpl);
    perFunction.set(tpl.function, (perFunction.get(tpl.function) ?? 0) + 1);
  }
  return picked;
}

const GENERAL_ASSISTANTS: VendorSlug[] = ["microsoft", "openai", "anthropic", "google", "amazon"];

/**
 * Platforms for an initiative created from a template, drawn only from tools the company already
 * uses: platform hints first (e.g. Salesforce for CRM use cases), otherwise their main assistant.
 */
export function suggestedPlatforms(tpl: StarterTemplate, tools: readonly string[]): VendorSlug[] {
  const known = tools.filter((x): x is VendorSlug => (AI_TOOL_SLUGS as string[]).includes(x));
  const hinted = (tpl.platformHints ?? []).filter((h) => known.includes(h));
  if (hinted.length) return hinted.slice(0, 2);
  const general = known.filter((x) => GENERAL_ASSISTANTS.includes(x));
  return general.slice(0, 1);
}

export const templateById = (id: string) => STARTER_TEMPLATES.find((x) => x.id === id);

/* ───────────────────────────── Template library (workspace) ───────────────────────────── */

/** Industry filter for the library: general templates fit everyone; industry-specific ones only their industries. */
export const templateFitsIndustry = (tpl: StarterTemplate, industry: string | null | undefined) =>
  !tpl.industries || (industry != null && tpl.industries.includes(industry as IndustrySlug));

/** Case-insensitive text search across what a template card shows. */
export function templateMatches(tpl: StarterTemplate, query: string | null | undefined): boolean {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  const fn = tpl.function === "cross_functional" ? "company-wide cross-functional" : functionLabel(tpl.function);
  return [tpl.title, tpl.problem, tpl.solution, fn, ...tpl.valueDrivers].some((s) => s.toLowerCase().includes(q));
}

/** Initiative fields for a template (stage "idea"); the same shape the assessment's starter workspace uses. */
export function templateInitiativeValues(tpl: StarterTemplate, tools: readonly string[] = []) {
  return {
    title: tpl.title,
    problemStatement: tpl.problem,
    proposedSolution: `${tpl.solution}\n\nTypical value drivers: ${tpl.valueDrivers.join("; ")}.`,
    businessUnit: tpl.function === "cross_functional" ? "Company-wide" : functionLabel(tpl.function),
    stage: "idea" as const,
    platforms: suggestedPlatforms(tpl, tools),
    buildApproach: tpl.buildApproach,
    valueScore: tpl.scores.value,
    feasibilityScore: tpl.scores.feasibility,
    alignmentScore: tpl.scores.alignment,
    riskScore: tpl.scores.risk,
    customerFacing: tpl.customerFacing,
    tags: ["template", `effort-${tpl.effort.toLowerCase()}`],
  };
}
