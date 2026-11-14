import "server-only";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { departmentMembers, departments, ideas, initiatives, memberships, user, type Department, type DepartmentRole } from "@/db/schema";
import type { WorkspaceContext } from "@/lib/workspace";
import { canInDepartment } from "./departments";
import type { Capability } from "./permissions";

export type DepartmentSummary = Department & { memberCount: number; leadNames: string[]; initiativeCount: number; newIdeaCount: number };

/** Every department in the workspace with headline counts, alphabetical. */
export async function listDepartments(orgId: string): Promise<DepartmentSummary[]> {
  const rows = await db.select().from(departments).where(eq(departments.orgId, orgId)).orderBy(asc(departments.name));
  if (!rows.length) return [];
  const ids = rows.map((d) => d.id);
  const [members, inits, newIdeas] = await Promise.all([
    db
      .select({ departmentId: departmentMembers.departmentId, role: departmentMembers.role, name: user.name })
      .from(departmentMembers)
      .innerJoin(user, eq(user.id, departmentMembers.userId))
      .where(inArray(departmentMembers.departmentId, ids)),
    db
      .select({ departmentId: initiatives.departmentId, n: count() })
      .from(initiatives)
      .where(and(inArray(initiatives.departmentId, ids), isNull(initiatives.archivedAt)))
      .groupBy(initiatives.departmentId),
    db
      .select({ departmentId: ideas.departmentId, n: count() })
      .from(ideas)
      .where(and(inArray(ideas.departmentId, ids), eq(ideas.status, "new")))
      .groupBy(ideas.departmentId),
  ]);
  return rows.map((d) => {
    const mine = members.filter((m) => m.departmentId === d.id);
    return {
      ...d,
      memberCount: mine.length,
      leadNames: mine.filter((m) => m.role === "lead").map((m) => m.name),
      initiativeCount: inits.find((i) => i.departmentId === d.id)?.n ?? 0,
      newIdeaCount: newIdeas.find((i) => i.departmentId === d.id)?.n ?? 0,
    };
  });
}

export async function getDepartment(orgId: string, slugOrId: { slug: string } | { id: string }) {
  const [row] = await db
    .select()
    .from(departments)
    .where(and(eq(departments.orgId, orgId), "slug" in slugOrId ? eq(departments.slug, slugOrId.slug) : eq(departments.id, slugOrId.id)))
    .limit(1);
  return row ?? null;
}

/** The signed-in person's role in each department of this workspace. */
export async function myDepartmentRoles(orgId: string, userId: string): Promise<Map<string, DepartmentRole>> {
  const rows = await db
    .select({ id: departmentMembers.departmentId, role: departmentMembers.role })
    .from(departmentMembers)
    .innerJoin(departments, eq(departments.id, departmentMembers.departmentId))
    .where(and(eq(departments.orgId, orgId), eq(departmentMembers.userId, userId)));
  return new Map(rows.map((r) => [r.id, r.role]));
}

export async function listDepartmentMembers(departmentId: string) {
  return db
    .select({ userId: user.id, name: user.name, email: user.email, jobTitle: user.jobTitle, role: departmentMembers.role, joinedAt: departmentMembers.createdAt })
    .from(departmentMembers)
    .innerJoin(user, eq(user.id, departmentMembers.userId))
    .where(eq(departmentMembers.departmentId, departmentId))
    .orderBy(asc(departmentMembers.role), asc(user.name));
}

/** Workspace members who aren't in this department yet (for the "add member" picker). */
export async function workspaceMembersOutside(orgId: string, departmentId: string) {
  const inside = db.select({ id: departmentMembers.userId }).from(departmentMembers).where(eq(departmentMembers.departmentId, departmentId));
  const rows = await db
    .select({ userId: user.id, name: user.name, email: user.email })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(user.name));
  const insideIds = new Set((await inside).map((r) => r.id));
  return rows.filter((r) => !insideIds.has(r.userId));
}

/** Department-aware permission check for the signed-in person. */
export async function canForDepartment(ctx: WorkspaceContext, capability: Capability, departmentId: string | null | undefined): Promise<boolean> {
  if (ctx.can(capability)) return true;
  if (!departmentId) return false;
  const [row] = await db
    .select({ role: departmentMembers.role })
    .from(departmentMembers)
    .where(and(eq(departmentMembers.departmentId, departmentId), eq(departmentMembers.userId, ctx.user.id)))
    .limit(1);
  return canInDepartment(ctx.access, capability, row?.role);
}
