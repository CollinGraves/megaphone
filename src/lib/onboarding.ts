/**
 * Workspace onboarding / activation: the first-week setup a North Labs consultant would do, as a
 * checklist the product walks a self-serve workspace through.
 *
 * - `evaluateActivation` is pure (counts in, steps + activated/stalled out) and safe on the client.
 * - `loadActivation` / `loadActivations` gather the counts with one aggregate query (correlated
 *   subqueries per workspace, no N+1), for the dashboard and the admin workspace list.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import type { Capability } from "@/lib/permissions";
import { hasFeature, isManaged, planForFeature } from "@/lib/plans";

/* ───────────────────────────── Definitions ───────────────────────────── */

/** A workspace counts as activated once this many core steps are done. */
export const ACTIVATION_THRESHOLD = 5;
/** Initiatives needed for the "add initiatives" step. */
export const INITIATIVE_TARGET = 3;
/** Self-serve workspaces older than this with fewer than STALLED_MAX_DONE core steps are "stalled". */
export const STALLED_AFTER_DAYS = 7;
export const STALLED_MAX_DONE = 2;
/** A completed checklist shows a short celebration for workspaces younger than this. */
export const CELEBRATE_WITHIN_DAYS = 30;

export type StepId = "initiatives" | "dependency" | "estimate" | "teammate" | "risk" | "ideas" | "actual" | "mcp";

export type ActivationCounts = {
  /** Active (non-archived) initiatives. */
  initiatives: number;
  /** Data dependencies on active initiatives. */
  dependencies: number;
  /** Impact metrics with an estimated value, on active initiatives. */
  estimates: number;
  members: number;
  /** Invitations not yet accepted, revoked or expired. */
  pendingInvites: number;
  /** Active initiatives with a risk tier other than "unclassified". */
  classified: number;
  ideas: number;
  intakeEnabled: boolean;
  /** Recorded actuals (impact measurements) on active initiatives. */
  actuals: number;
  /** Unrevoked API keys scoped to the workspace (MCP). */
  apiKeys: number;
};

/** Initiatives the step links point at (so "Map a data dependency" opens a real initiative). */
export type ActivationTargets = {
  /** Oldest active initiative. */
  initiativeId: string | null;
  /** Active initiative with the most recently added impact metric (for recording actuals). */
  metricInitiativeId: string | null;
};

export type ActivationOrg = {
  slug: string;
  plan: string;
  status?: string;
  createdAt: Date;
  onboardingDismissedAt: Date | null;
};

export type OnboardingStep = {
  id: StepId;
  title: string;
  /** One line on why it matters. */
  why: string;
  done: boolean;
  optional: boolean;
  /** Progress for counted steps, e.g. 1 of 3 initiatives. */
  progress?: { current: number; target: number };
  href: string;
  cta: string;
  /** Who can act on it; others see the step but not the link. */
  capability: Capability;
  /** Extra route for people with another capability (e.g. turning on the intake link). */
  secondary?: { href: string; cta: string; capability: Capability };
  /** e.g. "Team plan" when the step needs an upgrade. */
  requiresPlan?: string;
  /** Set when the step can't be done yet, e.g. "your first initiative". */
  waitingFor?: string;
};

export type Activation = {
  steps: OnboardingStep[];
  coreTotal: number;
  coreDone: number;
  /** 0–100, over core steps. */
  percent: number;
  /** Every core step done. */
  complete: boolean;
  /** At least ACTIVATION_THRESHOLD core steps done. */
  activated: boolean;
  /** Self-serve workspace older than STALLED_AFTER_DAYS with at most STALLED_MAX_DONE core steps. */
  stalled: boolean;
  managed: boolean;
  dismissed: boolean;
  ageDays: number;
};

const DAY = 86_400_000;

/** Pure: turn counts into the checklist. */
export function evaluateActivation(
  counts: ActivationCounts,
  org: ActivationOrg,
  opts: { now?: Date; targets?: Partial<ActivationTargets> } = {},
): Activation {
  const now = opts.now ?? new Date();
  const base = `/w/${org.slug}`;
  const first = opts.targets?.initiativeId ?? null;
  const metricTarget = opts.targets?.metricInitiativeId ?? null;
  const onInitiative = (anchor: string) => (first ? `${base}/initiatives/${first}#${anchor}` : `${base}/initiatives/templates`);
  const needsInitiative = counts.initiatives === 0 ? "your first initiative" : undefined;
  const intake = hasFeature(org.plan, "intake_link");
  const mcp = hasFeature(org.plan, "mcp_workspace");

  const steps: OnboardingStep[] = [
    {
      id: "initiatives",
      title: `Add ${INITIATIVE_TARGET} initiatives`,
      why: "A portfolio needs a few candidates side by side before you can prioritize.",
      done: counts.initiatives >= INITIATIVE_TARGET,
      optional: false,
      progress: { current: Math.min(counts.initiatives, INITIATIVE_TARGET), target: INITIATIVE_TARGET },
      href: `${base}/initiatives/templates`,
      cta: "Start from a template",
      capability: "initiative:write",
    },
    {
      id: "dependency",
      title: "Map a data dependency",
      why: "Data access is the most common blocker. Finding it early saves weeks later.",
      done: counts.dependencies > 0,
      optional: false,
      href: onInitiative("dep-data"),
      cta: "Add a dependency",
      capability: "initiative:write",
      waitingFor: needsInitiative,
    },
    {
      id: "estimate",
      title: "Set an impact estimate",
      why: "Expected hours or dollars turn an idea into a business case and drive the priority score.",
      done: counts.estimates > 0,
      optional: false,
      href: onInitiative("new-name"),
      cta: "Add an estimate",
      capability: "impact:write",
      waitingFor: needsInitiative,
    },
    {
      id: "teammate",
      title: "Invite a teammate",
      why: "AI programs need more than one owner, and a shared workspace stays current.",
      done: counts.members >= 2 || counts.pendingInvites > 0,
      optional: false,
      href: `${base}/settings#invite-email`,
      cta: "Invite someone",
      capability: "members:manage",
    },
    {
      id: "risk",
      title: "Classify risk on one initiative",
      why: "A risk tier shows which use cases need human oversight or review before they go live.",
      done: counts.classified > 0,
      optional: false,
      href: onInitiative("governance"),
      cta: "Classify risk",
      capability: "initiative:write",
      waitingFor: needsInitiative,
    },
    {
      id: "ideas",
      title: "Collect ideas from the business",
      why: intake
        ? "The best use cases come from the people doing the work. Share the intake link or log one yourself."
        : "The best use cases come from the people doing the work. Log the first one to start the pipeline.",
      done: counts.ideas > 0 || counts.intakeEnabled,
      optional: false,
      href: `${base}/ideas/new`,
      cta: "Submit an idea",
      capability: "ideas:submit",
      secondary: intake ? { href: `${base}/settings#intake`, cta: "Turn on the intake link", capability: "settings:manage" } : undefined,
    },
    {
      id: "actual",
      title: "Record a first actual",
      why: "Monthly actuals prove the value delivered, not just the value promised.",
      done: counts.actuals > 0,
      optional: false,
      href: metricTarget ? `${base}/initiatives/${metricTarget}#m-value` : onInitiative("new-name"),
      cta: "Record an actual",
      capability: "impact:write",
      waitingFor: counts.initiatives === 0 ? "your first initiative" : !metricTarget ? "an impact estimate" : undefined,
    },
    mcp
      ? {
          id: "mcp",
          title: "Connect your AI tools",
          why: "Ask Claude, ChatGPT or Cursor about the portfolio, and update it from where you work (MCP).",
          done: counts.apiKeys > 0,
          optional: true,
          href: "/settings#api",
          cta: "Create a workspace key",
          capability: "workspace:view",
        }
      : {
          id: "mcp",
          title: "Connect your AI tools",
          why: "Ask Claude, ChatGPT or Cursor about the portfolio, and update it from where you work (MCP).",
          done: counts.apiKeys > 0,
          optional: true,
          href: `${base}/billing?upgrade=mcp_workspace`,
          cta: "See plans",
          capability: "billing:manage",
          requiresPlan: `${planForFeature("mcp_workspace").name} plan`,
        },
  ];

  const core = steps.filter((s) => !s.optional);
  const coreDone = core.filter((s) => s.done).length;
  const managed = isManaged(org.plan);
  const ageDays = Math.max(0, Math.floor((now.getTime() - org.createdAt.getTime()) / DAY));
  return {
    steps,
    coreTotal: core.length,
    coreDone,
    percent: Math.round((coreDone / core.length) * 100),
    complete: coreDone === core.length,
    activated: coreDone >= ACTIVATION_THRESHOLD,
    stalled: !managed && org.status !== "suspended" && ageDays > STALLED_AFTER_DAYS && coreDone <= STALLED_MAX_DONE,
    managed,
    dismissed: org.onboardingDismissedAt != null,
    ageDays,
  };
}

/**
 * What the dashboard shows: the checklist while incomplete, a short celebration right after a
 * self-serve workspace finishes, nothing once dismissed (or for long-complete / managed workspaces).
 */
export function checklistMode(a: Activation): "checklist" | "celebrate" | "hidden" {
  if (a.dismissed) return "hidden";
  if (!a.complete) return "checklist";
  return !a.managed && a.ageDays <= CELEBRATE_WITHIN_DAYS ? "celebrate" : "hidden";
}

/* ───────────────────────────── Loaders ───────────────────────────── */

// Correlated per-workspace aggregates over the outer `organizations` row (qualified explicitly:
// drizzle renders bare column names in single-table selects, which would be ambiguous here).
const o = sql.raw(`"organizations"."id"`);
const countFields = {
  initiatives: sql<number>`(select count(*)::int from initiatives i where i.org_id = ${o} and i.archived_at is null)`,
  dependencies: sql<number>`(select count(*)::int from data_dependencies d join initiatives i on i.id = d.initiative_id where i.org_id = ${o} and i.archived_at is null)`,
  estimates: sql<number>`(select count(*)::int from impact_metrics m join initiatives i on i.id = m.initiative_id where i.org_id = ${o} and i.archived_at is null and m.estimated_value > 0)`,
  members: sql<number>`(select count(*)::int from memberships ms where ms.org_id = ${o})`,
  pendingInvites: sql<number>`(select count(*)::int from invitations v where v.org_id = ${o} and v.accepted_at is null and v.revoked_at is null and v.expires_at > now())`,
  classified: sql<number>`(select count(*)::int from initiatives i where i.org_id = ${o} and i.archived_at is null and i.risk_tier <> 'unclassified')`,
  ideas: sql<number>`(select count(*)::int from ideas x where x.org_id = ${o})`,
  intakeEnabled: sql<boolean>`(${organizations.intakeToken} is not null)`,
  actuals: sql<number>`(select count(*)::int from impact_measurements im join impact_metrics m on m.id = im.metric_id join initiatives i on i.id = m.initiative_id where i.org_id = ${o} and i.archived_at is null)`,
  apiKeys: sql<number>`(select count(*)::int from api_keys k where k.org_id = ${o} and k.revoked_at is null)`,
};
const orgFields = {
  id: organizations.id,
  slug: organizations.slug,
  plan: organizations.plan,
  status: organizations.status,
  createdAt: organizations.createdAt,
  onboardingDismissedAt: organizations.onboardingDismissedAt,
};
const targetFields = {
  initiativeId: sql<string | null>`(select i.id from initiatives i where i.org_id = ${o} and i.archived_at is null order by i.created_at, i.id limit 1)`,
  metricInitiativeId: sql<string | null>`(select i.id from impact_metrics m join initiatives i on i.id = m.initiative_id where i.org_id = ${o} and i.archived_at is null order by (m.estimated_value > 0) desc nulls last, m.created_at desc limit 1)`,
};

function splitRow(row: Record<string, unknown>): { org: ActivationOrg; counts: ActivationCounts } {
  const r = row as typeof row & ActivationCounts & ActivationOrg;
  return {
    org: { slug: r.slug, plan: r.plan, status: r.status, createdAt: r.createdAt, onboardingDismissedAt: r.onboardingDismissedAt },
    counts: {
      initiatives: Number(r.initiatives),
      dependencies: Number(r.dependencies),
      estimates: Number(r.estimates),
      members: Number(r.members),
      pendingInvites: Number(r.pendingInvites),
      classified: Number(r.classified),
      ideas: Number(r.ideas),
      intakeEnabled: Boolean(r.intakeEnabled),
      actuals: Number(r.actuals),
      apiKeys: Number(r.apiKeys),
    },
  };
}

/** One workspace, with step links pointing at real initiatives. A single query. */
export async function loadActivation(orgId: string, now = new Date()): Promise<Activation & { counts: ActivationCounts }> {
  const [row] = await db
    .select({ ...orgFields, ...countFields, ...targetFields })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) throw new Error(`Workspace not found: ${orgId}`);
  const { org, counts } = splitRow(row);
  return { ...evaluateActivation(counts, org, { now, targets: { initiativeId: row.initiativeId, metricInitiativeId: row.metricInitiativeId } }), counts };
}

/** Many workspaces (admin list). A single query regardless of how many. */
export async function loadActivations(orgIds: readonly string[], now = new Date()): Promise<Map<string, Activation & { counts: ActivationCounts }>> {
  const out = new Map<string, Activation & { counts: ActivationCounts }>();
  if (orgIds.length === 0) return out;
  const rows = await db
    .select({ ...orgFields, ...countFields })
    .from(organizations)
    .where(inArray(organizations.id, [...orgIds]));
  for (const row of rows) {
    const { org, counts } = splitRow(row);
    out.set(row.id, { ...evaluateActivation(counts, org, { now }), counts });
  }
  return out;
}
