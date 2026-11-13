"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  accessStatus,
  buildApproach,
  comments,
  dataDependencies,
  dataSensitivity,
  impactMeasurements,
  impactMetrics,
  initiativeHealth,
  initiativeStage,
  initiatives,
  metricPeriod,
  metricType,
  systemCategory,
  systems,
} from "@/db/schema";
import { ACCESS_STATUSES, HEALTH, STAGES, labelFrom } from "@/lib/taxonomy";
import { strs, type ActionState } from "@/lib/utils";
import { logActivity } from "@/lib/workspace";
import { PLATFORM_OPTIONS } from "../_components/badges";
import {
  ActionError,
  authorize,
  revalidateWorkspace,
  runAction,
  splitList,
  zId,
  zOptDate,
  zOptNumber,
  zOptText,
  zScore,
  zText,
} from "../_lib/action-utils";
import {
  getOwnedComment,
  getOwnedDependency,
  getOwnedInitiative,
  getOwnedMeasurement,
  getOwnedMetric,
  getOwnedSystem,
} from "../_lib/guards";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};

/* ───────────────────────────── Initiative CRUD ───────────────────────────── */

const initiativeSchema = z.object({
  title: z.string().trim().min(3, "must be at least 3 characters").max(160),
  problemStatement: zText(5000),
  proposedSolution: zText(5000),
  businessUnit: zOptText(100),
  sponsor: zOptText(120),
  ownerName: zOptText(120),
  stage: z.enum(initiativeStage.enumValues),
  health: z.enum(initiativeHealth.enumValues),
  buildApproach: z.preprocess((v) => (v === "" ? null : v), z.enum(buildApproach.enumValues).nullable()),
  valueScore: zScore(),
  feasibilityScore: zScore(),
  alignmentScore: zScore(),
  riskScore: zScore(),
  rankOverride: zOptNumber({ min: 1, max: 999, int: true }),
  estimatedBuildCost: zOptNumber({ min: 0, max: 1e10 }),
  estimatedAnnualRunCost: zOptNumber({ min: 0, max: 1e10 }),
  targetDate: zOptDate(),
  launchedAt: zOptDate(),
});

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  problemStatement: "problem statement",
  proposedSolution: "solution",
  businessUnit: "business unit",
  sponsor: "sponsor",
  ownerName: "owner",
  buildApproach: "build approach",
  rankOverride: "rank override",
  estimatedBuildCost: "build cost",
  estimatedAnnualRunCost: "run cost",
  targetDate: "target date",
  launchedAt: "launch date",
  platforms: "platforms",
  models: "models",
  tags: "tags",
};
const SCORE_FIELDS = ["valueScore", "feasibilityScore", "alignmentScore", "riskScore"] as const;
const PLATFORM_SLUGS = new Set(PLATFORM_OPTIONS.map((p) => p.slug));

function parseInitiative(form: FormData) {
  const parsed = initiativeSchema.parse({
    title: field(form, "title") ?? "",
    problemStatement: field(form, "problemStatement") ?? "",
    proposedSolution: field(form, "proposedSolution") ?? "",
    businessUnit: field(form, "businessUnit"),
    sponsor: field(form, "sponsor"),
    ownerName: field(form, "ownerName"),
    stage: field(form, "stage"),
    health: field(form, "health"),
    buildApproach: field(form, "buildApproach") ?? "",
    valueScore: field(form, "valueScore"),
    feasibilityScore: field(form, "feasibilityScore"),
    alignmentScore: field(form, "alignmentScore"),
    riskScore: field(form, "riskScore"),
    rankOverride: field(form, "rankOverride"),
    estimatedBuildCost: field(form, "estimatedBuildCost"),
    estimatedAnnualRunCost: field(form, "estimatedAnnualRunCost"),
    targetDate: field(form, "targetDate"),
    launchedAt: field(form, "launchedAt"),
  });
  return {
    ...parsed,
    platforms: [...new Set(strs(form, "platforms"))].filter((p) => PLATFORM_SLUGS.has(p)),
    models: splitList(field(form, "models"), 20).map((m) => m.slice(0, 80)),
    tags: splitList(field(form, "tags"), 20).map((t) => t.toLowerCase().slice(0, 40)),
  };
}

type InitiativeValues = ReturnType<typeof parseInitiative>;

function describeChanges(before: typeof initiatives.$inferSelect, after: InitiativeValues): string[] {
  const changes: string[] = [];
  if (before.stage !== after.stage) changes.push(`stage to ${labelFrom(STAGES, after.stage)}`);
  if (before.health !== after.health) changes.push(`health to ${labelFrom(HEALTH, after.health)}`);
  if (SCORE_FIELDS.some((k) => before[k] !== after[k])) changes.push("prioritization scores");
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    const a = before[key as keyof typeof before];
    const b = after[key as keyof InitiativeValues];
    const same = Array.isArray(a) && Array.isArray(b) ? a.join("|") === b.join("|") : (a ?? null) === (b ?? null);
    if (!same) changes.push(label);
  }
  return changes;
}

export async function saveInitiative(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const values = parseInitiative(form);
    const id = field(form, "id");
    let initiativeId: string;
    if (id) {
      const existing = await getOwnedInitiative(ctx, id);
      const changes = describeChanges(existing, values);
      await db.update(initiatives).set(values).where(and(eq(initiatives.id, existing.id), eq(initiatives.orgId, ctx.org.id)));
      if (changes.length) await logActivity(ctx, "initiative.updated", { title: values.title, changes }, existing.id);
      initiativeId = existing.id;
    } else {
      const [created] = await db
        .insert(initiatives)
        .values({ ...values, orgId: ctx.org.id, createdById: ctx.user.id })
        .returning({ id: initiatives.id });
      await logActivity(ctx, "initiative.created", { title: values.title }, created.id);
      initiativeId = created.id;
    }
    revalidateWorkspace(ctx.org.slug);
    redirect(`/w/${ctx.org.slug}/initiatives/${initiativeId}`);
  });
}

export async function setArchived(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:delete");
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "id")));
    const archive = field(form, "archive") === "1";
    await db.update(initiatives).set({ archivedAt: archive ? new Date() : null }).where(eq(initiatives.id, initiative.id));
    await logActivity(ctx, archive ? "initiative.archived" : "initiative.restored", { title: initiative.title }, initiative.id);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: archive ? "Initiative archived." : "Initiative restored." };
  });
}

export async function deleteInitiative(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:delete");
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "id")));
    if (!initiative.archivedAt) throw new ActionError("Archive the initiative before deleting it.");
    await db.delete(initiatives).where(eq(initiatives.id, initiative.id));
    // Logged without initiativeId: the row (and its cascade) is gone.
    await logActivity(ctx, "initiative.deleted", { title: initiative.title });
    revalidateWorkspace(ctx.org.slug);
    redirect(`/w/${ctx.org.slug}/initiatives`);
  });
}

/* ───────────────────────────── Comments ───────────────────────────── */

export async function addComment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "comment:write");
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "initiativeId")));
    const body = z.string().trim().min(1, "can't be empty").max(5000).parse(field(form, "body") ?? "");
    await db.insert(comments).values({ initiativeId: initiative.id, userId: ctx.user.id, body });
    await logActivity(ctx, "comment.added", { excerpt: body.slice(0, 120) }, initiative.id);
    revalidateWorkspace(ctx.org.slug);
  });
}

export async function deleteComment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "comment:write");
    const comment = await getOwnedComment(ctx, zId().parse(field(form, "id")));
    if (comment.userId !== ctx.user.id && !ctx.can("members:manage")) throw new ActionError("You can only delete your own comments.");
    await db.delete(comments).where(eq(comments.id, comment.id));
    await logActivity(ctx, "comment.deleted", undefined, comment.initiativeId);
    revalidateWorkspace(ctx.org.slug);
  });
}

/* ───────────────────────────── Impact metrics ───────────────────────────── */

const metricSchema = z.object({
  type: z.enum(metricType.enumValues),
  name: z.string().trim().min(2, "is required").max(120),
  unit: zOptText(30),
  period: z.enum(metricPeriod.enumValues),
  estimatedValue: zOptNumber({ min: 0, max: 1e12 }),
  hourlyRate: zOptNumber({ min: 0, max: 10_000 }),
  assumptions: zOptText(2000),
});

const DEFAULT_UNITS: Record<string, string> = { hours_saved: "hours", cost_saved: "usd", revenue_generated: "usd" };

function parseMetric(form: FormData) {
  const m = metricSchema.parse({
    type: field(form, "type"),
    name: field(form, "name") ?? "",
    unit: field(form, "unit"),
    period: field(form, "period"),
    estimatedValue: field(form, "estimatedValue"),
    hourlyRate: field(form, "hourlyRate"),
    assumptions: field(form, "assumptions"),
  });
  const unit = DEFAULT_UNITS[m.type] ?? m.unit;
  if (!unit) throw new ActionError("Unit: custom metrics need a unit (e.g. tickets, %, usd).");
  return { ...m, unit, hourlyRate: m.type === "hours_saved" ? m.hourlyRate : null };
}

export async function addMetric(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "impact:write");
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "initiativeId")));
    const values = parseMetric(form);
    await db.insert(impactMetrics).values({ ...values, initiativeId: initiative.id });
    await logActivity(ctx, "metric.added", { metric: values.name }, initiative.id);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Metric added." };
  });
}

export async function updateMetric(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "impact:write");
    const { metric, initiativeId } = await getOwnedMetric(ctx, zId().parse(field(form, "id")));
    const values = parseMetric(form);
    await db.update(impactMetrics).set(values).where(eq(impactMetrics.id, metric.id));
    await logActivity(ctx, "metric.updated", { metric: values.name }, initiativeId);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Metric updated." };
  });
}

export async function deleteMetric(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "impact:write");
    const { metric, initiativeId } = await getOwnedMetric(ctx, zId().parse(field(form, "id")));
    await db.delete(impactMetrics).where(eq(impactMetrics.id, metric.id));
    await logActivity(ctx, "metric.removed", { metric: metric.name }, initiativeId);
    revalidateWorkspace(ctx.org.slug);
  });
}

const measurementSchema = z.object({
  metricId: zId(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "pick a month"),
  value: zOptNumber({ min: -1e12, max: 1e12 }).refine((v) => v != null, "is required"),
  note: zOptText(500),
});

export async function recordMeasurement(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "impact:write");
    const m = measurementSchema.parse({
      metricId: field(form, "metricId"),
      month: field(form, "month"),
      value: field(form, "value"),
      note: field(form, "note"),
    });
    const { metric, initiativeId } = await getOwnedMetric(ctx, m.metricId);
    const periodStart = `${m.month}-01`;
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (m.month > currentMonth) throw new ActionError("Month: actuals can't be recorded for future periods.");
    await db
      .insert(impactMeasurements)
      .values({ metricId: metric.id, periodStart, value: m.value!, note: m.note, recordedById: ctx.user.id })
      .onConflictDoUpdate({
        target: [impactMeasurements.metricId, impactMeasurements.periodStart],
        set: { value: m.value!, note: m.note, recordedById: ctx.user.id },
      });
    await logActivity(ctx, "measurement.recorded", { metric: metric.name, period: periodStart, value: m.value }, initiativeId);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: `Recorded ${metric.name}.` };
  });
}

export async function deleteMeasurement(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "impact:write");
    const { measurement, metric } = await getOwnedMeasurement(ctx, zId().parse(field(form, "id")));
    await db.delete(impactMeasurements).where(eq(impactMeasurements.id, measurement.id));
    await logActivity(ctx, "measurement.removed", { metric: metric.name, period: measurement.periodStart }, metric.initiativeId);
    revalidateWorkspace(ctx.org.slug);
  });
}

/* ───────────────────────────── Data dependencies ───────────────────────────── */

const dependencySchema = z.object({
  initiativeId: zId(),
  systemId: zOptText(100),
  newSystemName: zOptText(120),
  newSystemCategory: z.enum(systemCategory.enumValues).default("other"),
  dataDescription: z.string().trim().min(2, "is required").max(500),
  accessStatus: z.enum(accessStatus.enumValues),
  sensitivity: z.enum(dataSensitivity.enumValues),
  notes: zOptText(1000),
});

export async function addDependency(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const d = dependencySchema.parse({
      initiativeId: field(form, "initiativeId"),
      systemId: field(form, "systemId"),
      newSystemName: field(form, "newSystemName"),
      newSystemCategory: field(form, "newSystemCategory") || undefined,
      dataDescription: field(form, "dataDescription") ?? "",
      accessStatus: field(form, "accessStatus"),
      sensitivity: field(form, "sensitivity"),
      notes: field(form, "notes"),
    });
    const initiative = await getOwnedInitiative(ctx, d.initiativeId);

    let system: { id: string; name: string };
    if (d.systemId && d.systemId !== "__new") {
      system = await getOwnedSystem(ctx, d.systemId);
    } else {
      if (!d.newSystemName) throw new ActionError("System: pick an existing system or enter a name for a new one.");
      if (!ctx.can("system:write")) throw new ActionError("You don't have permission to add systems.");
      const [existing] = await db
        .select({ id: systems.id, name: systems.name })
        .from(systems)
        .where(and(eq(systems.orgId, ctx.org.id), eq(systems.name, d.newSystemName)))
        .limit(1);
      if (existing) {
        system = existing;
      } else {
        [system] = await db
          .insert(systems)
          .values({ orgId: ctx.org.id, name: d.newSystemName, category: d.newSystemCategory })
          .returning({ id: systems.id, name: systems.name });
        await logActivity(ctx, "system.created", { name: system.name });
      }
    }

    await db.insert(dataDependencies).values({
      initiativeId: initiative.id,
      systemId: system.id,
      dataDescription: d.dataDescription,
      accessStatus: d.accessStatus,
      sensitivity: d.sensitivity,
      notes: d.notes,
    });
    await logActivity(ctx, "dependency.added", { system: system.name, data: d.dataDescription }, initiative.id);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: `Added dependency on ${system.name}.` };
  });
}

export async function updateDependencyStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const { dependency, systemName } = await getOwnedDependency(ctx, zId().parse(field(form, "id")));
    const status = z.enum(accessStatus.enumValues).parse(field(form, "accessStatus"));
    if (status === dependency.accessStatus) return { ok: true };
    await db.update(dataDependencies).set({ accessStatus: status }).where(eq(dataDependencies.id, dependency.id));
    await logActivity(ctx, "dependency.updated", { system: systemName, accessStatus: status, label: labelFrom(ACCESS_STATUSES, status) }, dependency.initiativeId);
    revalidateWorkspace(ctx.org.slug);
  });
}

export async function removeDependency(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const { dependency, systemName } = await getOwnedDependency(ctx, zId().parse(field(form, "id")));
    await db.delete(dataDependencies).where(eq(dataDependencies.id, dependency.id));
    await logActivity(ctx, "dependency.removed", { system: systemName }, dependency.initiativeId);
    revalidateWorkspace(ctx.org.slug);
  });
}
