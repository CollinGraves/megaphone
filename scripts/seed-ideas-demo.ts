/**
 * Demo idea intake for the `acme` workspace: ~8 ideas across statuses and channels, and the
 * shareable intake link turned on for @acme.example emails. Idempotent (ideas are keyed by title;
 * an existing intake token is kept).
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json scripts/seed-ideas-demo.ts
 *
 * Run scripts/seed-demo.ts first.
 */
import "./load-env";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, ideas, initiatives, organizations, user } from "@/db/schema";
import { appUrl } from "@/lib/env";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number, hours = 0) => new Date(Date.now() - n * DAY - hours * 60 * 60 * 1000);

type Seed = {
  title: string;
  problem: string;
  desiredOutcome?: string;
  department: string;
  frequency: string;
  peopleAffected?: number;
  hoursPerWeek?: number;
  systemsInvolved?: string;
  urgency: "low" | "medium" | "high";
  submitter: { name: string; email: string } | "viewer" | "editor";
  status: "new" | "under_review" | "accepted" | "declined" | "duplicate";
  triageNotes?: string;
  declineReason?: string;
  /** Title of an existing acme initiative (accepted → converted into it; duplicate → duplicates it). */
  initiative?: string;
  ageDays: number;
};

const SEEDS: Seed[] = [
  {
    title: "Summarize shift handover notes for the next crew",
    problem:
      "Every shift lead writes a free-text handover in the MES log and the next lead has to read 3–4 pages to find what matters (machine issues, open quality holds, staffing gaps). Things get missed, especially on night shift.",
    desiredOutcome: "A one-screen summary at shift start: open issues, holds and anything that changed, with links back to the log.",
    department: "Operations",
    frequency: "daily",
    peopleAffected: 40,
    hoursPerWeek: 1.5,
    systemsInvolved: "MES shift log, Teams",
    urgency: "high",
    submitter: { name: "Luis Romero", email: "luis.romero@acme.example" },
    status: "new",
    ageDays: 0.2,
  },
  {
    title: "Answer “where is my order?” questions from dealers",
    problem:
      "About a third of the emails our dealer support team gets are order-status questions. Each one means looking up the order in SAP, checking the carrier site and writing a reply.",
    desiredOutcome: "Dealers get an instant, accurate status answer in the portal; the team only handles exceptions.",
    department: "Customer Service",
    frequency: "many_daily",
    peopleAffected: 12,
    hoursPerWeek: 6,
    systemsInvolved: "SAP S/4HANA, dealer portal, carrier tracking",
    urgency: "high",
    submitter: { name: "Hannah Kim", email: "hannah.kim@acme.example" },
    status: "new",
    ageDays: 1,
  },
  {
    title: "Draft the monthly variance commentary",
    problem:
      "At month-end the FP&A team writes commentary explaining budget-vs-actual variances for every cost center. Most of it is pulling numbers from the close pack and restating them in words.",
    desiredOutcome: "A first draft of the commentary generated from the close pack that analysts edit, so close finishes a day earlier.",
    department: "Finance",
    frequency: "monthly",
    peopleAffected: 5,
    hoursPerWeek: 4,
    systemsInvolved: "Snowflake, Excel close pack",
    urgency: "medium",
    submitter: "viewer",
    status: "new",
    ageDays: 3,
  },
  {
    title: "Translate safety work instructions for the plant floor",
    problem:
      "Work instructions are written in English but a large part of the Monterrey and Wrocław crews read Spanish or Polish first. Translations are done ad hoc by bilingual supervisors and quickly go out of date.",
    desiredOutcome: "Every updated work instruction is available in Spanish and Polish within a day, reviewed by a supervisor.",
    department: "EHS",
    frequency: "ad_hoc",
    peopleAffected: 8,
    hoursPerWeek: 3,
    systemsInvolved: "SharePoint document library",
    urgency: "medium",
    submitter: { name: "Agnieszka Nowak", email: "agnieszka.nowak@eu.acme.example" },
    status: "under_review",
    triageNotes: "Check with EHS on review requirements for safety-critical docs. Possibly a configure-only job with M365 Copilot.",
    ageDays: 6,
  },
  {
    title: "Search 20 years of engineering change orders",
    problem:
      "When we redesign a part, engineers dig through old ECOs in PDM to find why a previous change was made. Search only works on titles, so people ask around or start from scratch.",
    desiredOutcome: "Ask a question in plain English and get the relevant ECOs with the reasoning quoted.",
    department: "Engineering",
    frequency: "weekly",
    peopleAffected: 25,
    hoursPerWeek: 2,
    systemsInvolved: "PDM (Windchill), SharePoint",
    urgency: "medium",
    submitter: "editor",
    status: "under_review",
    triageNotes: "Strong candidate. Need to confirm PDM export access with IT.",
    ageDays: 9,
  },
  {
    title: "Stop re-keying supplier invoices into SAP",
    problem:
      "AP clerks manually type line items from PDF invoices into SAP and chase mismatches with POs. We process ~4,000 invoices a month and the backlog grows at quarter-end.",
    desiredOutcome: "Invoices are read and matched automatically; clerks only handle exceptions.",
    department: "Finance",
    frequency: "daily",
    peopleAffected: 6,
    hoursPerWeek: 10,
    systemsInvolved: "SAP S/4HANA, AP shared mailbox",
    urgency: "high",
    submitter: { name: "Grace Liu", email: "grace.liu@acme.example" },
    status: "accepted",
    initiative: "Accounts-payable invoice processing",
    ageDays: 16,
  },
  {
    title: "AI-written LinkedIn posts for every employee",
    problem: "Our employer brand is weak on LinkedIn. If everyone posted weekly we'd get more reach.",
    department: "Marketing",
    frequency: "weekly",
    peopleAffected: 200,
    hoursPerWeek: 0.5,
    urgency: "low",
    submitter: { name: "Tyler Brooks", email: "tyler.brooks@acme.example" },
    status: "declined",
    declineReason:
      "Thanks Tyler! Ghost-written personal posts conflict with our social media policy, and the marketing copy pilot showed limited value. Marketing is planning an employee-advocacy program instead — we've passed your idea on to them.",
    ageDays: 12,
  },
  {
    title: "Chatbot for HR benefits questions",
    problem: "Open enrollment floods HR with the same questions about plans, deductibles and dependents. People wait days for answers.",
    desiredOutcome: "Employees get instant answers to benefits questions, with links to the right policy.",
    department: "Human Resources",
    frequency: "daily",
    peopleAffected: 4,
    hoursPerWeek: 8,
    systemsInvolved: "Workday, benefits PDFs",
    urgency: "medium",
    submitter: { name: "Omar Haddad", email: "omar.haddad@acme.example" },
    status: "duplicate",
    initiative: "HR policy & benefits assistant",
    ageDays: 20,
  },
];

async function main() {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "acme")).limit(1);
  if (!org) throw new Error("Workspace `acme` not found — run scripts/seed-demo.ts first.");

  const people = await db.select({ id: user.id, name: user.name, email: user.email }).from(user);
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const viewer = byEmail.get("viewer@acme.example");
  const editor = byEmail.get("editor@acme.example");
  if (!viewer || !editor) throw new Error("Demo users missing — run scripts/seed-demo.ts first.");

  const orgInitiatives = await db.select({ id: initiatives.id, title: initiatives.title, sourceIdeaId: initiatives.sourceIdeaId }).from(initiatives).where(eq(initiatives.orgId, org.id));
  const existing = new Set((await db.select({ title: ideas.title }).from(ideas).where(eq(ideas.orgId, org.id))).map((r) => r.title));

  let created = 0;
  for (const s of SEEDS) {
    if (existing.has(s.title)) {
      console.log(`  idea exists: ${s.title}`);
      continue;
    }
    const member = s.submitter === "viewer" ? viewer : s.submitter === "editor" ? editor : null;
    const submitter = member ? { name: member.name, email: member.email } : (s.submitter as { name: string; email: string });
    const linked = s.initiative ? orgInitiatives.find((i) => i.title === s.initiative) : undefined;
    if (s.initiative && !linked) console.warn(`  initiative not found: ${s.initiative} (idea will not be linked)`);
    const createdAt = daysAgo(s.ageDays);
    const triaged = s.status !== "new";

    const [row] = await db
      .insert(ideas)
      .values({
        orgId: org.id,
        title: s.title,
        problem: s.problem,
        desiredOutcome: s.desiredOutcome ?? null,
        department: s.department,
        frequency: s.frequency,
        peopleAffected: s.peopleAffected ?? null,
        hoursPerWeek: s.hoursPerWeek ?? null,
        systemsInvolved: s.systemsInvolved ?? null,
        urgency: s.urgency,
        submitterName: submitter.name,
        submitterEmail: submitter.email.toLowerCase(),
        submittedById: member?.id ?? null,
        channel: member ? "workspace" : "intake_link",
        status: s.status,
        triageNotes: s.triageNotes ?? null,
        declineReason: s.declineReason ?? null,
        triagedById: triaged ? editor.id : null,
        triagedAt: triaged ? new Date(createdAt.getTime() + 2 * DAY) : null,
        initiativeId: linked?.id ?? null,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: ideas.id });

    if (s.status === "accepted" && linked) {
      await db.update(initiatives).set({ sourceIdeaId: row.id }).where(and(eq(initiatives.id, linked.id), isNull(initiatives.sourceIdeaId)));
    }
    await db.insert(activityLog).values({
      orgId: org.id,
      userId: member?.id ?? null,
      action: "idea.submitted",
      detail: { ideaId: row.id, title: s.title, channel: member ? "workspace" : "intake_link", submitterName: submitter.name },
      createdAt,
    });
    if (triaged) {
      const actions: Record<Seed["status"], string> = { new: "idea.submitted", under_review: "idea.under_review", accepted: "idea.accepted", declined: "idea.declined", duplicate: "idea.duplicate" };
      const action = actions[s.status];
      await db.insert(activityLog).values({
        orgId: org.id,
        userId: editor.id,
        initiativeId: s.status === "accepted" || s.status === "duplicate" ? (linked?.id ?? null) : null,
        action,
        detail: {
          ideaId: row.id,
          title: s.title,
          ...(s.status === "accepted" ? { initiativeTitle: linked?.title } : {}),
          ...(s.status === "duplicate" ? { of: linked?.title, ofKind: "initiative" } : {}),
          ...(s.status === "declined" ? { reason: s.declineReason, notified: true } : {}),
        },
        createdAt: new Date(createdAt.getTime() + 2 * DAY),
      });
    }
    created++;
    console.log(`  created idea [${s.status}]: ${s.title}`);
  }

  const token = org.intakeToken ?? randomBytes(18).toString("base64url");
  const domains = org.intakeAllowedDomains.length ? org.intakeAllowedDomains : ["acme.example"];
  await db.update(organizations).set({ intakeToken: token, intakeAllowedDomains: domains }).where(eq(organizations.id, org.id));

  console.log(`\nIdeas created: ${created}. Intake link (${domains.map((d) => `@${d}`).join(", ")}):\n  ${appUrl()}/intake/${token}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
