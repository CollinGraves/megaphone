/**
 * Governance demo data for the `acme` workspace: risk tiers, oversight, approvals (one approved with
 * conditions, one overdue for re-review, one pending, one high-risk without oversight, …) plus a
 * matching governance history in the activity log.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json scripts/seed-governance-demo.ts
 *   … scripts/seed-governance-demo.ts --force   # also overwrite initiatives whose governance was already edited
 *
 * Idempotent: by default only initiatives still at the defaults (unclassified, not submitted, no
 * governance history) are touched. Run scripts/seed-demo.ts first.
 */
import "./load-env";
import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, initiatives, organizations, user } from "@/db/schema";
import { computeReviewDue, normalizePolicy } from "@/lib/governance";

const FORCE = process.argv.includes("--force");
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

type Who = "owner" | "editor" | "consultant";
type Plan = {
  riskTier: (typeof initiatives.$inferInsert)["riskTier"];
  customerFacing: boolean | null;
  affectsIndividuals: boolean | null;
  humanOversight: (typeof initiatives.$inferInsert)["humanOversight"];
  governanceNotes?: string;
  request?: { by: Who; daysAgo: number; note?: string };
  decision?: { by: Who; daysAgo: number; status: "approved" | "conditional" | "rejected"; note?: string };
};

const PLANS: Record<string, Plan> = {
  "Customer service email triage & reply drafting": {
    riskTier: "limited",
    customerFacing: true,
    affectsIndividuals: false,
    humanOversight: "review_all",
    governanceNotes: "Agents approve every drafted reply before it is sent. Customer emails (PII) stay in the Zendesk tenant; Anthropic zero-retention terms in place.",
    request: { by: "editor", daysAgo: 160, note: "Ready for production after a 6-week pilot with the Tier 1 team." },
    decision: {
      by: "owner",
      daysAgo: 150,
      status: "conditional",
      note: "Keep human review of every reply until the edit rate is under 10% for two consecutive months; add an “AI-assisted” line to the email footer.",
    },
  },
  "Sales call summaries & CRM hygiene": {
    riskTier: "minimal",
    customerFacing: false,
    affectsIndividuals: false,
    humanOversight: "spot_check",
    governanceNotes: "Reps review summaries before they sync to Salesforce. Call recordings are retained per the existing sales recording policy.",
    request: { by: "editor", daysAgo: 410 },
    // Approved 13 months ago → the 12-month re-review is overdue.
    decision: { by: "consultant", daysAgo: 400, status: "approved", note: "Low risk: internal productivity, no decisions about individuals." },
  },
  "Predictive maintenance: anomaly detection & explanations": {
    riskTier: "minimal",
    customerFacing: false,
    affectsIndividuals: false,
    humanOversight: "human_decides",
    governanceNotes: "Maintenance planners decide on every work order; the model only flags anomalies.",
    request: { by: "editor", daysAgo: 3, note: "Moving the Line 2 pilot to all plants next quarter." },
  },
  "HR policy & benefits assistant": {
    riskTier: "high",
    customerFacing: false,
    affectsIndividuals: true,
    humanOversight: "none",
    governanceNotes: "Answers benefits-eligibility questions for employees from HRIS data. Needs an HR escalation path before pilot.",
  },
  "Demand forecasting with narrative insights": {
    riskTier: "minimal",
    customerFacing: false,
    affectsIndividuals: false,
    humanOversight: "review_all",
  },
  "Quote generation for sales engineers": {
    riskTier: "limited",
    customerFacing: true,
    affectsIndividuals: false,
    humanOversight: "review_all",
    governanceNotes: "Quotes go to customers; a sales engineer signs off on every quote.",
  },
  "Visual quality inspection on weld seams": {
    riskTier: "minimal",
    customerFacing: false,
    affectsIndividuals: false,
    humanOversight: "spot_check",
  },
  "Marketing copy generator (SaaS pilot)": {
    riskTier: "limited",
    customerFacing: true,
    affectsIndividuals: false,
    humanOversight: "review_all",
    request: { by: "editor", daysAgo: 520 },
    decision: { by: "owner", daysAgo: 515, status: "approved" },
  },
  // "Supplier contract review assistant" (pilot) and "Accounts-payable invoice processing" (idea) are left
  // unclassified on purpose, so the register shows an unclassified initiative already in pilot.
};

async function main() {
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "acme")).limit(1);
  if (!org) throw new Error("No acme workspace — run scripts/seed-demo.ts first.");
  const people = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.email, ["owner@acme.example", "editor@acme.example", "consultant@northlabs.io"]));
  const idOf = (who: Who) => {
    const email = { owner: "owner@acme.example", editor: "editor@acme.example", consultant: "consultant@northlabs.io" }[who];
    const id = people.find((p) => p.email === email)?.id;
    if (!id) throw new Error(`Missing demo user ${email}`);
    return id;
  };
  const policy = normalizePolicy(org.governancePolicy);

  const rows = await db.select().from(initiatives).where(and(eq(initiatives.orgId, org.id), inArray(initiatives.title, Object.keys(PLANS))));
  for (const row of rows) {
    const plan = PLANS[row.title];
    const history = await db
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(and(eq(activityLog.initiativeId, row.id), like(activityLog.action, "governance.%")));
    const untouched = row.riskTier === "unclassified" && row.approvalStatus === "not_submitted" && history.length === 0;
    if (!untouched && !FORCE) {
      console.log(`  skip (already has governance data): ${row.title}`);
      continue;
    }
    if (history.length) await db.delete(activityLog).where(inArray(activityLog.id, history.map((h) => h.id)));

    const requestedAt = plan.request ? daysAgo(plan.request.daysAgo) : null;
    const decidedAt = plan.decision ? daysAgo(plan.decision.daysAgo) : null;
    const status = plan.decision?.status ?? (plan.request ? "pending" : "not_submitted");
    await db
      .update(initiatives)
      .set({
        riskTier: plan.riskTier,
        customerFacing: plan.customerFacing,
        affectsIndividuals: plan.affectsIndividuals,
        humanOversight: plan.humanOversight,
        governanceNotes: plan.governanceNotes ?? null,
        approvalStatus: status,
        approvalRequestedAt: requestedAt,
        approvalRequestedById: plan.request ? idOf(plan.request.by) : null,
        approvalDecidedAt: decidedAt,
        approvalDecidedById: plan.decision ? idOf(plan.decision.by) : null,
        approvalConditions: plan.decision?.note ?? null,
        reviewDueOn: decidedAt && status !== "rejected" ? computeReviewDue(decidedAt, policy.reviewIntervalMonths) : null,
      })
      .where(eq(initiatives.id, row.id));

    const events: (typeof activityLog.$inferInsert)[] = [
      {
        orgId: org.id,
        initiativeId: row.id,
        userId: idOf("editor"),
        action: "governance.classified",
        detail: { title: row.title, tier: plan.riskTier, changes: ["risk tier", "customer-facing", "affects individuals", "oversight"] },
        createdAt: daysAgo((plan.request?.daysAgo ?? 20) + 2),
      },
    ];
    if (plan.request) {
      events.push({
        orgId: org.id,
        initiativeId: row.id,
        userId: idOf(plan.request.by),
        action: "governance.review_requested",
        detail: { title: row.title, tier: plan.riskTier, previousStatus: "not_submitted", note: plan.request.note ?? null },
        createdAt: requestedAt!,
      });
    }
    if (plan.decision) {
      events.push({
        orgId: org.id,
        initiativeId: row.id,
        userId: idOf(plan.decision.by),
        action:
          plan.decision.status === "approved" ? "governance.approved" : plan.decision.status === "conditional" ? "governance.approved_with_conditions" : "governance.rejected",
        detail: { title: row.title, tier: plan.riskTier, note: plan.decision.note ?? null, renewal: false, selfApproved: false },
        createdAt: decidedAt!,
      });
    }
    await db.insert(activityLog).values(events);
    console.log(`  ${row.title}: ${plan.riskTier}, ${status}`);
  }
  console.log("\nGovernance demo ready: /w/acme/governance");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
