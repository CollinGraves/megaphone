/**
 * Demo workspace: "Acme Manufacturing" (slug `acme`) with users, systems, initiatives, impact data,
 * data dependencies, comments, activity and Radar alerts.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/seed-demo.ts           # idempotent: skips existing content
 *   npx tsx --tsconfig tsconfig.json scripts/seed-demo.ts --reset   # wipes and re-seeds the acme workspace content
 *
 * All demo users share the password `radar-demo-123`.
 */
import "./load-env";
import { and, arrayOverlaps, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  comments,
  consultantAssignments,
  dataDependencies,
  impactMeasurements,
  impactMetrics,
  initiativeAlerts,
  initiatives,
  memberships,
  organizations,
  stories,
  systems,
  user,
  type OrgRole,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { shiftMonth } from "@/lib/impact";
import { ALERT_CATEGORIES, categoryLabel, vendorLabel } from "@/lib/taxonomy";

const PASSWORD = "radar-demo-123";
const RESET = process.argv.includes("--reset");

type DemoUser = {
  email: string;
  name: string;
  company: string;
  jobTitle: string;
  industry: string;
  platformRole?: "consultant";
  orgRole?: OrgRole;
};

const USERS: DemoUser[] = [
  { email: "consultant@northlabs.io", name: "Jordan Reyes", company: "North Labs", jobTitle: "Principal AI Consultant", industry: "technology", platformRole: "consultant" },
  { email: "owner@acme.example", name: "Dana Whitfield", company: "Acme Manufacturing", jobTitle: "Chief Operating Officer", industry: "manufacturing", orgRole: "owner" },
  { email: "editor@acme.example", name: "Priya Nair", company: "Acme Manufacturing", jobTitle: "AI Program Lead", industry: "manufacturing", orgRole: "editor" },
  { email: "viewer@acme.example", name: "Marcus Lee", company: "Acme Manufacturing", jobTitle: "VP Finance", industry: "manufacturing", orgRole: "viewer" },
];

async function ensureUser(u: DemoUser): Promise<string> {
  const email = u.email.toLowerCase();
  let [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  if (!row) {
    const res = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: u.name } });
    row = { id: res.user.id };
    console.log(`  created user ${email}`);
  } else {
    console.log(`  user exists ${email}`);
  }
  await db
    .update(user)
    .set({
      company: u.company,
      jobTitle: u.jobTitle,
      industry: u.industry,
      companySize: "1,001–5,000",
      onboardedAt: new Date(),
      emailVerified: true,
      ...(u.platformRole ? { platformRole: u.platformRole } : {}),
    })
    .where(eq(user.id, row.id));
  return row.id;
}

/* ───────────────────────────── Content ───────────────────────────── */

const SYSTEMS = [
  { key: "sfdc", name: "Salesforce", category: "crm", vendor: "Salesforce", owner: "Sales Operations", description: "Sales Cloud + Service Cloud. Accounts, opportunities, cases." },
  { key: "sap", name: "SAP S/4HANA", category: "erp", vendor: "SAP", owner: "Finance IT", description: "Finance, procurement, inventory and production planning." },
  { key: "snow", name: "Snowflake", category: "data_warehouse", vendor: "Snowflake", owner: "Data Platform", description: "Enterprise data warehouse; curated marts for supply chain and finance." },
  { key: "sp", name: "SharePoint", category: "document_store", vendor: "Microsoft", owner: "IT Collaboration", description: "Contracts, SOPs, policies and engineering documentation." },
  { key: "sn", name: "ServiceNow", category: "ticketing", vendor: "ServiceNow", owner: "IT Service Management", description: "IT and customer-service ticketing." },
  { key: "wd", name: "Workday", category: "hris", vendor: "Workday", owner: "People Operations", description: "Employee records, benefits and HR policies." },
  { key: "m365", name: "Microsoft 365", category: "communication", vendor: "Microsoft", owner: "IT Collaboration", description: "Outlook, Teams, OneDrive." },
  { key: "mes", name: "FactoryOne MES", category: "custom_app", vendor: "In-house", owner: "Plant Engineering", description: "Custom manufacturing execution system: sensor telemetry, work orders, downtime events." },
] as const;
type SystemKey = (typeof SYSTEMS)[number]["key"];

type Dep = { system: SystemKey; data: string; access: "not_requested" | "requested" | "granted" | "blocked"; sensitivity: "public" | "internal" | "confidential" | "pii" | "phi" | "pci"; notes?: string };
type Metric = {
  type: "hours_saved" | "cost_saved" | "revenue_generated" | "custom";
  name: string;
  unit: string;
  period: "monthly" | "annual" | "one_time";
  estimate: number;
  hourlyRate?: number;
  assumptions: string;
  /** Actuals for the most recent completed months, oldest first. */
  actuals?: number[];
};
type Seed = {
  key: string;
  title: string;
  problem: string;
  solution: string;
  bu: string;
  sponsor: string;
  owner: string;
  stage: "idea" | "evaluating" | "building" | "pilot" | "production" | "retired";
  health: "on_track" | "at_risk" | "blocked";
  platforms: string[];
  models: string[];
  approach: "buy" | "configure" | "build" | "partner";
  scores: [number, number, number, number];
  rankOverride?: number;
  buildCost?: number;
  runCost?: number;
  targetMonths?: number;
  launchedMonthsAgo?: number;
  tags: string[];
  deps: Dep[];
  metrics: Metric[];
};

const INITIATIVES: Seed[] = [
  {
    key: "cs",
    title: "Customer service email triage & reply drafting",
    problem: "The service desk receives ~9,000 customer emails a month about order status, warranty and returns. Agents spend most of their time reading, categorizing and writing near-identical replies; first-response time averages 19 hours.",
    solution: "Claude classifies inbound emails, pulls order and case context from Salesforce and ServiceNow, and drafts a reply for the agent to approve. Low-risk categories (order status) are sent automatically after review sampling.",
    bu: "Customer Service",
    sponsor: "Dana Whitfield (COO)",
    owner: "Elena Brooks",
    stage: "production",
    health: "on_track",
    platforms: ["anthropic"],
    models: ["Claude Sonnet 5", "Claude Haiku 4.5"],
    approach: "build",
    scores: [5, 4, 5, 2],
    buildCost: 180_000,
    runCost: 60_000,
    launchedMonthsAgo: 7,
    tags: ["customer-experience", "genai", "agent-assist"],
    deps: [
      { system: "sfdc", data: "Accounts, orders and case history", access: "granted", sensitivity: "pii" },
      { system: "sn", data: "Customer-service tickets and resolution notes", access: "granted", sensitivity: "confidential" },
      { system: "sp", data: "Warranty and returns policy documents", access: "granted", sensitivity: "internal" },
    ],
    metrics: [
      { type: "hours_saved", name: "Agent handling time saved", unit: "hours", period: "monthly", estimate: 1400, assumptions: "9,000 emails × ~9.5 min saved each.", actuals: [820, 1010, 1190, 1280, 1350, 1420] },
      { type: "custom", name: "First-response time", unit: "hours", period: "monthly", estimate: 4, assumptions: "Target median first-response time.", actuals: [11, 8, 6, 5, 4.5, 3.8] },
    ],
  },
  {
    key: "sales",
    title: "Sales call summaries & CRM hygiene",
    problem: "Account managers skip CRM updates after customer calls; pipeline data is stale and forecast calls take hours of manual chasing.",
    solution: "Microsoft Copilot for Sales summarizes Teams calls and proposes Salesforce opportunity updates that reps accept with one click.",
    bu: "Sales",
    sponsor: "Rob Castillo (CRO)",
    owner: "Hannah Ito",
    stage: "production",
    health: "on_track",
    platforms: ["microsoft", "openai"],
    models: ["Copilot for Sales"],
    approach: "configure",
    scores: [4, 5, 4, 2],
    buildCost: 35_000,
    runCost: 72_000,
    launchedMonthsAgo: 5,
    tags: ["copilot", "sales-productivity"],
    deps: [
      { system: "sfdc", data: "Opportunities, contacts and activities (write access)", access: "granted", sensitivity: "confidential" },
      { system: "m365", data: "Teams meeting transcripts and Outlook email", access: "granted", sensitivity: "confidential" },
    ],
    metrics: [
      { type: "hours_saved", name: "Rep admin time saved", unit: "hours", period: "monthly", estimate: 650, hourlyRate: 95, assumptions: "120 reps × ~5.4 h/month of CRM admin.", actuals: [380, 470, 520, 560] },
      { type: "revenue_generated", name: "Win-rate uplift on forecasted deals", unit: "usd", period: "annual", estimate: 400_000, assumptions: "1 pt win-rate uplift on $40M qualified pipeline.", },
    ],
  },
  {
    key: "pdm",
    title: "Predictive maintenance: anomaly detection & explanations",
    problem: "Unplanned downtime on the stamping lines costs ~$38k per hour. Maintenance techs get noisy sensor alarms without context on likely root cause.",
    solution: "Anomaly models on MES telemetry flag deviations; an LLM on Amazon Bedrock explains likely causes and suggests work-order steps from the maintenance manual.",
    bu: "Operations",
    sponsor: "Dana Whitfield (COO)",
    owner: "Tomás Herrera",
    stage: "pilot",
    health: "at_risk",
    platforms: ["amazon", "anthropic"],
    models: ["Claude on Amazon Bedrock", "SageMaker anomaly detection"],
    approach: "partner",
    scores: [5, 3, 5, 3],
    rankOverride: 1,
    buildCost: 320_000,
    runCost: 90_000,
    launchedMonthsAgo: 3,
    targetMonths: 4,
    tags: ["plant-floor", "ml", "downtime"],
    deps: [
      { system: "mes", data: "Sensor telemetry (vibration, temperature, cycle time) at 1s resolution", access: "granted", sensitivity: "internal" },
      { system: "snow", data: "Historical downtime events and maintenance logs", access: "requested", sensitivity: "internal", notes: "Data platform team needs a service account approved by security." },
      { system: "sap", data: "Spare-parts inventory (PM module)", access: "requested", sensitivity: "internal" },
    ],
    metrics: [
      { type: "cost_saved", name: "Avoided unplanned downtime", unit: "usd", period: "monthly", estimate: 60_000, assumptions: "~1.6 fewer downtime hours/month at $38k/hour on two pilot lines.", actuals: [22_000, 41_000, 35_000] },
    ],
  },
  {
    key: "contracts",
    title: "Supplier contract review assistant",
    problem: "Procurement reviews ~150 supplier contracts a quarter against our playbook. Legal is a bottleneck and off-playbook terms slip through.",
    solution: "Claude compares each draft against the negotiation playbook and prior agreements in SharePoint, flags deviations with suggested redlines, and routes only exceptions to Legal.",
    bu: "Procurement",
    sponsor: "Grace Okafor (CFO)",
    owner: "Leah Park",
    stage: "pilot",
    health: "on_track",
    platforms: ["anthropic"],
    models: ["Claude Opus 5.5"],
    approach: "build",
    scores: [4, 4, 4, 3],
    buildCost: 90_000,
    runCost: 24_000,
    launchedMonthsAgo: 2,
    targetMonths: 2,
    tags: ["legal", "procurement", "genai"],
    deps: [
      { system: "sp", data: "Executed supplier contracts and negotiation playbook", access: "granted", sensitivity: "confidential" },
      { system: "sap", data: "Supplier master and spend by vendor", access: "granted", sensitivity: "confidential" },
    ],
    metrics: [
      { type: "hours_saved", name: "Legal & procurement review time", unit: "hours", period: "monthly", estimate: 220, hourlyRate: 140, assumptions: "50 contracts/month × 4.4 hours saved.", actuals: [140, 185] },
      { type: "cost_saved", name: "Better negotiated terms", unit: "usd", period: "annual", estimate: 250_000, assumptions: "0.5% improvement on $50M addressable spend." },
    ],
  },
  {
    key: "forecast",
    title: "Demand forecasting with narrative insights",
    problem: "Planners rebuild the monthly demand forecast in spreadsheets; forecast error is ~28% MAPE and leadership can't see why numbers move.",
    solution: "Gemini on Vertex AI generates driver-based forecasts from Snowflake history and writes a plain-language narrative of changes for the S&OP meeting.",
    bu: "Supply Chain",
    sponsor: "Grace Okafor (CFO)",
    owner: "Sam Whitaker",
    stage: "building",
    health: "at_risk",
    platforms: ["google", "snowflake"],
    models: ["Gemini 3 Pro", "Snowflake Cortex"],
    approach: "build",
    scores: [5, 3, 4, 2],
    buildCost: 210_000,
    runCost: 40_000,
    targetMonths: 3,
    tags: ["s&op", "forecasting"],
    deps: [
      { system: "snow", data: "Order history, shipments and promotions calendar (3 years)", access: "granted", sensitivity: "internal" },
      { system: "sap", data: "Open sales orders and production plan", access: "requested", sensitivity: "confidential", notes: "Waiting on SAP basis team for read-only RFC user." },
    ],
    metrics: [
      { type: "cost_saved", name: "Inventory carrying cost reduction", unit: "usd", period: "annual", estimate: 900_000, assumptions: "4 pt MAPE improvement → ~6% safety-stock reduction on $60M inventory at 25% carrying cost." },
      { type: "hours_saved", name: "Planner time saved", unit: "hours", period: "monthly", estimate: 160, assumptions: "8 planners × 20 hours/month." },
    ],
  },
  {
    key: "hr",
    title: "HR policy & benefits assistant",
    problem: "People Ops answers the same benefits and leave questions hundreds of times a month across five plants and three languages.",
    solution: "ChatGPT Enterprise custom GPT grounded in policy documents and (phase 2) employee-specific Workday data, available in Teams.",
    bu: "Human Resources",
    sponsor: "Monique Adams (CHRO)",
    owner: "Chris Delgado",
    stage: "building",
    health: "blocked",
    platforms: ["openai", "microsoft"],
    models: ["ChatGPT Enterprise (GPT-5.5)"],
    approach: "configure",
    scores: [3, 3, 3, 4],
    buildCost: 25_000,
    runCost: 54_000,
    targetMonths: 2,
    tags: ["employee-experience", "multilingual"],
    deps: [
      { system: "sp", data: "HR policies, benefits guides (EN/ES/PL)", access: "granted", sensitivity: "internal" },
      { system: "wd", data: "Employee leave balances and benefit elections", access: "blocked", sensitivity: "pii", notes: "Privacy review requires DPIA before any employee-level data leaves Workday." },
    ],
    metrics: [
      { type: "hours_saved", name: "HR inquiries deflected", unit: "hours", period: "monthly", estimate: 180, assumptions: "1,100 inquiries/month × 60% deflection × 10 min." },
    ],
  },
  {
    key: "quality",
    title: "Visual quality inspection on weld seams",
    problem: "Manual weld inspection catches ~92% of defects; escapes generate warranty claims and rework.",
    solution: "Evaluate vision models (Gemini, GPT-5.5 vision and a fine-tuned open model) against 20k labeled seam images from the Monterrey plant.",
    bu: "Quality",
    sponsor: "Dana Whitfield (COO)",
    owner: "Ingrid Novak",
    stage: "evaluating",
    health: "on_track",
    platforms: ["google", "openai", "in_house"],
    models: ["Gemini 3 Pro Vision", "GPT-5.5", "Fine-tuned YOLO"],
    approach: "build",
    scores: [4, 2, 4, 3],
    buildCost: 150_000,
    targetMonths: 6,
    tags: ["computer-vision", "plant-floor"],
    deps: [
      { system: "mes", data: "Inspection images and defect labels", access: "requested", sensitivity: "internal" },
    ],
    metrics: [
      { type: "cost_saved", name: "Warranty & rework reduction", unit: "usd", period: "annual", estimate: 520_000, assumptions: "Halving weld-related warranty claims ($1.04M last FY)." },
    ],
  },
  {
    key: "quote",
    title: "Quote generation for sales engineers",
    problem: "Configured-to-order quotes take sales engineers 2–3 days; slow quotes lose deals.",
    solution: "Assistant that drafts BOM-based quotes from customer RFQs, prior quotes and SAP pricing conditions.",
    bu: "Sales",
    sponsor: "Rob Castillo (CRO)",
    owner: "Hannah Ito",
    stage: "evaluating",
    health: "on_track",
    platforms: ["openai"],
    models: ["GPT-5.5"],
    approach: "build",
    scores: [4, 3, 3, 3],
    tags: ["sales-productivity", "cpq"],
    deps: [
      { system: "sap", data: "Material master, pricing conditions", access: "not_requested", sensitivity: "confidential" },
      { system: "sfdc", data: "RFQs and historical quotes", access: "not_requested", sensitivity: "confidential" },
    ],
    metrics: [
      { type: "revenue_generated", name: "Additional deals won from faster quotes", unit: "usd", period: "annual", estimate: 600_000, assumptions: "Quote turnaround from 2.5 days to same-day; +3% win rate on $20M." },
    ],
  },
  {
    key: "ap",
    title: "Accounts-payable invoice processing",
    problem: "AP keys in ~4,000 non-PO invoices a month by hand.",
    solution: "Azure AI Document Intelligence + Azure OpenAI to extract, code and route invoices into SAP.",
    bu: "Finance",
    sponsor: "Grace Okafor (CFO)",
    owner: "Victor Chen",
    stage: "idea",
    health: "on_track",
    platforms: ["microsoft"],
    models: ["Azure OpenAI", "Azure Document Intelligence"],
    approach: "buy",
    scores: [3, 4, 3, 2],
    tags: ["finance-ops", "document-ai"],
    deps: [{ system: "sap", data: "Vendor invoices, GL coding", access: "not_requested", sensitivity: "pci" }],
    metrics: [
      { type: "hours_saved", name: "AP clerk time saved", unit: "hours", period: "monthly", estimate: 330, assumptions: "4,000 invoices × 5 min." },
    ],
  },
  {
    key: "marketing",
    title: "Marketing copy generator (SaaS pilot)",
    problem: "Product marketing wanted faster first drafts of datasheets and campaign copy.",
    solution: "Piloted a SaaS copywriting tool; retired in favor of the enterprise Claude rollout which covers the same use case.",
    bu: "Marketing",
    sponsor: "Rob Castillo (CRO)",
    owner: "Aisha Rahman",
    stage: "retired",
    health: "on_track",
    platforms: ["openai"],
    models: ["Jasper"],
    approach: "buy",
    scores: [2, 5, 2, 2],
    runCost: 18_000,
    tags: ["marketing"],
    deps: [],
    metrics: [],
  },
];

async function seedAlerts(orgId: string, rows: { id: string; platforms: string[]; stage: string }[]) {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({ id: stories.id, vendors: stories.vendors, categories: stories.categories })
    .from(stories)
    .where(
      and(
        eq(stories.status, "published"),
        gte(stories.importance, 3),
        gte(stories.publishedAt, since),
        arrayOverlaps(stories.categories, ALERT_CATEGORIES),
      ),
    )
    .orderBy(desc(stories.publishedAt))
    .limit(200);
  const alerts: (typeof initiativeAlerts.$inferInsert)[] = [];
  for (const i of rows) {
    if (i.stage === "retired") continue;
    const hits = candidates.filter((s) => s.vendors.some((v) => i.platforms.includes(v))).slice(0, 2);
    for (const s of hits) {
      const category = s.categories.find((c) => (ALERT_CATEGORIES as string[]).includes(c)) ?? s.categories[0];
      const vendors = i.platforms.filter((p) => s.vendors.includes(p)).map(vendorLabel);
      alerts.push({
        orgId,
        initiativeId: i.id,
        storyId: s.id,
        reason: `${categoryLabel(category)} news for ${vendors.join(", ")}, a platform this initiative is built on.`,
      });
    }
  }
  if (alerts.length) await db.insert(initiativeAlerts).values(alerts).onConflictDoNothing();
  return alerts.length;
}

async function main() {
  console.log("Users");
  const ids: Record<string, string> = {};
  for (const u of USERS) ids[u.email] = await ensureUser(u);
  const consultantId = ids["consultant@northlabs.io"];
  const ownerId = ids["owner@acme.example"];
  const editorId = ids["editor@acme.example"];
  const viewerId = ids["viewer@acme.example"];

  console.log("Workspace");
  let [org] = await db.select().from(organizations).where(eq(organizations.slug, "acme")).limit(1);
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: "Acme Manufacturing", slug: "acme", industry: "manufacturing", plan: "engagement", defaultHourlyRate: 85, provisionedById: consultantId })
      .returning();
    console.log("  created org acme");
  }
  for (const u of USERS) {
    if (!u.orgRole) continue;
    await db
      .insert(memberships)
      .values({ orgId: org.id, userId: ids[u.email], role: u.orgRole })
      .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { role: u.orgRole } });
  }
  await db.insert(consultantAssignments).values({ orgId: org.id, userId: consultantId }).onConflictDoNothing();

  const existing = await db.select({ id: initiatives.id }).from(initiatives).where(eq(initiatives.orgId, org.id));
  if (existing.length && !RESET) {
    console.log(`  ${existing.length} initiatives already present — skipping content (pass --reset to re-seed).`);
    return;
  }
  if (RESET) {
    // Cascades remove dependencies, metrics, measurements, comments, alerts and initiative activity.
    await db.delete(initiatives).where(eq(initiatives.orgId, org.id));
    await db.delete(systems).where(eq(systems.orgId, org.id));
    await db.delete(activityLog).where(eq(activityLog.orgId, org.id));
    await db.update(organizations).set({ defaultHourlyRate: 85, scoringWeights: { value: 0.4, feasibility: 0.3, alignment: 0.2, risk: 0.1 } }).where(eq(organizations.id, org.id));
    console.log("  reset workspace content");
  }

  console.log("Systems");
  const sysRows = await db
    .insert(systems)
    .values(SYSTEMS.map((s) => ({ name: s.name, category: s.category, vendor: s.vendor, owner: s.owner, description: s.description, orgId: org.id })))
    .returning({ id: systems.id, name: systems.name });
  const systemId = (key: SystemKey) => sysRows.find((r) => r.name === SYSTEMS.find((s) => s.key === key)!.name)!.id;

  console.log("Initiatives");
  const now = new Date();
  const created: { id: string; key: string; title: string; platforms: string[]; stage: string }[] = [];
  for (const [n, s] of INITIATIVES.entries()) {
    const createdAt = new Date(now.getTime() - (200 - n * 12) * 24 * 60 * 60 * 1000);
    const [row] = await db
      .insert(initiatives)
      .values({
        orgId: org.id,
        title: s.title,
        problemStatement: s.problem,
        proposedSolution: s.solution,
        businessUnit: s.bu,
        sponsor: s.sponsor,
        ownerName: s.owner,
        stage: s.stage,
        health: s.health,
        platforms: s.platforms,
        models: s.models,
        buildApproach: s.approach,
        valueScore: s.scores[0],
        feasibilityScore: s.scores[1],
        alignmentScore: s.scores[2],
        riskScore: s.scores[3],
        rankOverride: s.rankOverride ?? null,
        estimatedBuildCost: s.buildCost ?? null,
        estimatedAnnualRunCost: s.runCost ?? null,
        targetDate: s.targetMonths != null ? shiftMonth(now, s.targetMonths) : null,
        launchedAt: s.launchedMonthsAgo != null ? shiftMonth(now, -s.launchedMonthsAgo) : null,
        tags: s.tags,
        createdById: n % 2 === 0 ? editorId : consultantId,
        createdAt,
      })
      .returning({ id: initiatives.id });
    created.push({ id: row.id, key: s.key, title: s.title, platforms: s.platforms, stage: s.stage });

    if (s.deps.length) {
      await db.insert(dataDependencies).values(
        s.deps.map((d) => ({
          initiativeId: row.id,
          systemId: systemId(d.system),
          dataDescription: d.data,
          accessStatus: d.access,
          sensitivity: d.sensitivity,
          notes: d.notes ?? null,
        })),
      );
    }
    for (const m of s.metrics) {
      const [metric] = await db
        .insert(impactMetrics)
        .values({
          initiativeId: row.id,
          type: m.type,
          name: m.name,
          unit: m.unit,
          period: m.period,
          estimatedValue: m.estimate,
          hourlyRate: m.hourlyRate ?? null,
          assumptions: m.assumptions,
        })
        .returning({ id: impactMetrics.id });
      if (m.actuals?.length) {
        const count = m.actuals.length;
        await db.insert(impactMeasurements).values(
          m.actuals.map((value, idx) => ({
            metricId: metric.id,
            periodStart: shiftMonth(now, -(count - idx)),
            value,
            recordedById: editorId,
          })),
        );
      }
    }
    await db.insert(activityLog).values({
      orgId: org.id,
      initiativeId: row.id,
      userId: n % 2 === 0 ? editorId : consultantId,
      action: "initiative.created",
      detail: { title: s.title },
      createdAt,
    });
  }
  const byKey = (key: string) => created.find((c) => c.key === key)!.id;

  console.log("Comments & activity");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
  await db.insert(comments).values([
    { initiativeId: byKey("cs"), userId: ownerId, body: "Great results — let's present the handling-time numbers at the November board meeting.", createdAt: daysAgo(6) },
    { initiativeId: byKey("cs"), userId: editorId, body: "Auto-send for order-status emails is live after two weeks of 100% review sampling with a 0.4% edit rate.", createdAt: daysAgo(4) },
    { initiativeId: byKey("pdm"), userId: consultantId, body: "Snowflake service account is the critical path. I've escalated with the security architect; ETA next Friday.", createdAt: daysAgo(3) },
    { initiativeId: byKey("pdm"), userId: viewerId, body: "Can we see avoided-downtime savings broken down by line for the Q4 forecast?", createdAt: daysAgo(2) },
    { initiativeId: byKey("hr"), userId: editorId, body: "DPIA draft submitted to Privacy. Phase 1 (policy documents only) could ship without Workday data — proposing we split it.", createdAt: daysAgo(1) },
  ]);
  await db.insert(activityLog).values([
    { orgId: org.id, initiativeId: byKey("pdm"), userId: consultantId, action: "initiative.updated", detail: { title: INITIATIVES[2].title, changes: ["health"] }, createdAt: daysAgo(3) },
    { orgId: org.id, initiativeId: byKey("hr"), userId: editorId, action: "dependency.updated", detail: { system: "Workday", accessStatus: "blocked" }, createdAt: daysAgo(2) },
    { orgId: org.id, initiativeId: byKey("cs"), userId: editorId, action: "measurement.recorded", detail: { metric: "Agent handling time saved", period: shiftMonth(now, -1), value: 1420 }, createdAt: daysAgo(1) },
    { orgId: org.id, initiativeId: byKey("sales"), userId: editorId, action: "measurement.recorded", detail: { metric: "Rep admin time saved", period: shiftMonth(now, -1), value: 560 }, createdAt: daysAgo(1) },
    { orgId: org.id, initiativeId: null, userId: ownerId, action: "member.invited", detail: { email: "cfo.office@acme.example", role: "viewer" }, createdAt: daysAgo(5) },
  ]);

  console.log("Radar alerts");
  const alertCount = await seedAlerts(org.id, created);
  console.log(`  ${alertCount} alerts`);

}

main()
  .then(() => {
    console.log("\nDemo workspace ready: /w/acme");
    console.log(`Logins (password ${PASSWORD}): ${USERS.map((u) => u.email).join(", ")}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
