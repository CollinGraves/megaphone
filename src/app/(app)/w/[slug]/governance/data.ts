import "server-only";
import { and, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, consultantAssignments, dataDependencies, initiatives, memberships, systems, user, type Initiative, type Organization } from "@/db/schema";
import {
  governanceIssues,
  isoDate,
  maxSensitivity,
  normalizePolicy,
  reviewState,
  suggestRiskTier,
  type GovernanceIssue,
  type ReviewState,
  type Sensitivity,
  type TierSuggestion,
} from "@/lib/governance";
import { RISK_TIERS } from "@/lib/taxonomy";

export type RegisterRow = Initiative & {
  maxSensitivity: Sensitivity | null;
  dataSources: { system: string; sensitivity: string }[];
  requestedByName: string | null;
  decidedByName: string | null;
  suggestion: TierSuggestion;
  issues: GovernanceIssue[];
  review: ReviewState;
};

/** Every active (non-archived) initiative with its governance facts, issues and suggested tier. */
export async function loadRegister(org: Organization) {
  const policy = normalizePolicy(org.governancePolicy);
  const today = isoDate(new Date());
  const rows = await db
    .select()
    .from(initiatives)
    .where(and(eq(initiatives.orgId, org.id), isNull(initiatives.archivedAt)))
    .orderBy(initiatives.title);
  const ids = rows.map((r) => r.id);
  const userIds = [...new Set(rows.flatMap((r) => [r.approvalRequestedById, r.approvalDecidedById]).filter((x): x is string => Boolean(x)))];
  const [deps, people] = await Promise.all([
    ids.length
      ? db
          .select({ initiativeId: dataDependencies.initiativeId, sensitivity: dataDependencies.sensitivity, system: systems.name })
          .from(dataDependencies)
          .innerJoin(systems, eq(dataDependencies.systemId, systems.id))
          .where(and(inArray(dataDependencies.initiativeId, ids), eq(systems.orgId, org.id)))
          .orderBy(systems.name)
      : Promise.resolve([]),
    userIds.length ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds)) : Promise.resolve([]),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const depsBy = Map.groupBy(deps, (d) => d.initiativeId);

  const items: RegisterRow[] = rows.map((r) => {
    const dataSources = (depsBy.get(r.id) ?? []).map((d) => ({ system: d.system, sensitivity: d.sensitivity }));
    const max = maxSensitivity(dataSources.map((d) => d.sensitivity));
    return {
      ...r,
      maxSensitivity: max,
      dataSources,
      requestedByName: r.approvalRequestedById ? (names.get(r.approvalRequestedById) ?? null) : null,
      decidedByName: r.approvalDecidedById ? (names.get(r.approvalDecidedById) ?? null) : null,
      suggestion: suggestRiskTier({ ...r, maxSensitivity: max }),
      issues: governanceIssues(r, { policy, today, maxSensitivity: max }),
      review: reviewState(r, today),
    };
  });
  return { items, policy, today };
}

export type RegisterSummary = {
  total: number;
  byTier: Record<string, number>;
  pending: number;
  overdue: number;
  dueSoon: number;
  unclassifiedLive: number;
  highNoOversight: number;
  needsAttention: number;
};

/** Counts for the summary cards (retired initiatives count in the tier mix but raise no issues). */
export function summarizeRegister(items: RegisterRow[]): RegisterSummary {
  const byTier = Object.fromEntries(RISK_TIERS.map((t) => [t.slug, 0])) as Record<string, number>;
  const active = items.filter((i) => i.stage !== "retired");
  for (const i of active) byTier[i.riskTier] = (byTier[i.riskTier] ?? 0) + 1;
  const has = (i: RegisterRow, code: GovernanceIssue["code"]) => i.issues.some((x) => x.code === code);
  return {
    total: active.length,
    byTier,
    pending: items.filter((i) => i.approvalStatus === "pending").length,
    overdue: active.filter((i) => i.review === "overdue").length,
    dueSoon: active.filter((i) => i.review === "due_soon").length,
    unclassifiedLive: items.filter((i) => has(i, "unclassified_live")).length,
    highNoOversight: items.filter((i) => has(i, "high_risk_no_oversight")).length,
    needsAttention: items.filter((i) => i.issues.length > 0).length,
  };
}

export type RegisterFilters = {
  tier?: string;
  status?: string;
  oversight?: string;
  stage?: string;
  data?: string;
  attention?: boolean;
  /** A specific GovernanceIssueCode. */
  issue?: string;
  q?: string;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export function parseRegisterFilters(sp: Record<string, string | string[] | undefined>): RegisterFilters {
  return {
    tier: one(sp.tier),
    status: one(sp.status),
    oversight: one(sp.oversight),
    stage: one(sp.stage),
    data: one(sp.data),
    attention: one(sp.attention) === "1",
    issue: one(sp.issue),
    q: one(sp.q)?.slice(0, 100),
  };
}

export function filterRegister(items: RegisterRow[], f: RegisterFilters): RegisterRow[] {
  const q = f.q?.toLowerCase();
  return items.filter(
    (i) =>
      (!f.tier || i.riskTier === f.tier) &&
      (!f.status || i.approvalStatus === f.status) &&
      (!f.oversight || (f.oversight === "unset" ? i.humanOversight == null : i.humanOversight === f.oversight)) &&
      (!f.stage || i.stage === f.stage) &&
      (!f.data || (f.data === "none" ? i.maxSensitivity == null : i.maxSensitivity === f.data)) &&
      (!f.attention || i.issues.length > 0) &&
      (!f.issue || i.issues.some((x) => x.code === f.issue)) &&
      (!q ||
        [i.title, i.businessUnit, i.ownerName, i.sponsor, i.governanceNotes, ...i.models, ...i.platforms, ...i.tags]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(q))),
  );
}

export function filterQuery(f: RegisterFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (k === "attention") {
      if (v) p.set(k, "1");
    } else if (typeof v === "string" && v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ───────────────────────────── Initiative-level helpers ───────────────────────────── */

export async function loadDependencySensitivities(orgId: string, initiativeId: string) {
  return db
    .select({ sensitivity: dataDependencies.sensitivity, system: systems.name })
    .from(dataDependencies)
    .innerJoin(systems, eq(dataDependencies.systemId, systems.id))
    .where(and(eq(dataDependencies.initiativeId, initiativeId), eq(systems.orgId, orgId)))
    .orderBy(systems.name);
}

export type GovernanceEvent = { id: string; action: string; detail: Record<string, unknown> | null; createdAt: Date; userName: string | null };

/** The governance audit trail for one initiative (from the activity log), newest first. */
export async function loadGovernanceTimeline(orgId: string, initiativeId: string, limit = 20): Promise<GovernanceEvent[]> {
  return db
    .select({ id: activityLog.id, action: activityLog.action, detail: activityLog.detail, createdAt: activityLog.createdAt, userName: user.name })
    .from(activityLog)
    .leftJoin(user, eq(activityLog.userId, user.id))
    .where(and(eq(activityLog.orgId, orgId), eq(activityLog.initiativeId, initiativeId), like(activityLog.action, "governance.%")))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

/** People who can approve reviews and should hear about requests: owners, admins and assigned North Labs consultants. */
export async function loadApprovers(orgId: string) {
  const [members, consultants] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(memberships)
      .innerJoin(user, eq(memberships.userId, user.id))
      .where(and(eq(memberships.orgId, orgId), inArray(memberships.role, ["owner", "admin"]))),
    db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(consultantAssignments)
      .innerJoin(user, eq(consultantAssignments.userId, user.id))
      .where(and(eq(consultantAssignments.orgId, orgId), eq(user.platformRole, "consultant"))),
  ]);
  const seen = new Map<string, { id: string; name: string; email: string }>();
  for (const p of [...members, ...consultants]) seen.set(p.id, p);
  return [...seen.values()];
}
