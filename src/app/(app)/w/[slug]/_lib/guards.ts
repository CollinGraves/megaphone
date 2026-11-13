import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, dataDependencies, impactMeasurements, impactMetrics, initiativeAlerts, initiatives, systems } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/workspace";
import { ActionError } from "./action-utils";

/*
 * Tenant guards: every ID that arrives from a form is re-resolved against the caller's org.
 * A miss is reported as "not found" so cross-tenant probing learns nothing.
 */

export async function getOwnedInitiative(ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(initiatives)
    .where(and(eq(initiatives.id, id), eq(initiatives.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("Initiative not found.");
  return row;
}

export async function getOwnedSystem(ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(systems)
    .where(and(eq(systems.id, id), eq(systems.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("System not found.");
  return row;
}

export async function getOwnedMetric(ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select({ metric: impactMetrics, initiativeId: initiatives.id })
    .from(impactMetrics)
    .innerJoin(initiatives, eq(impactMetrics.initiativeId, initiatives.id))
    .where(and(eq(impactMetrics.id, id), eq(initiatives.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("Metric not found.");
  return row;
}

export async function getOwnedMeasurement(ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select({ measurement: impactMeasurements, metric: impactMetrics })
    .from(impactMeasurements)
    .innerJoin(impactMetrics, eq(impactMeasurements.metricId, impactMetrics.id))
    .innerJoin(initiatives, eq(impactMetrics.initiativeId, initiatives.id))
    .where(and(eq(impactMeasurements.id, id), eq(initiatives.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("Measurement not found.");
  return row;
}

export async function getOwnedDependency(ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select({ dependency: dataDependencies, systemName: systems.name })
    .from(dataDependencies)
    .innerJoin(initiatives, eq(dataDependencies.initiativeId, initiatives.id))
    .innerJoin(systems, eq(dataDependencies.systemId, systems.id))
    .where(and(eq(dataDependencies.id, id), eq(initiatives.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("Dependency not found.");
  return row;
}

export async function getOwnedComment(ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select({ comment: comments })
    .from(comments)
    .innerJoin(initiatives, eq(comments.initiativeId, initiatives.id))
    .where(and(eq(comments.id, id), eq(initiatives.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("Comment not found.");
  return row.comment;
}

export async function getOwnedAlert(ctx: WorkspaceContext, id: string) {
  const [row] = await db
    .select()
    .from(initiativeAlerts)
    .where(and(eq(initiativeAlerts.id, id), eq(initiativeAlerts.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("Alert not found.");
  return row;
}
