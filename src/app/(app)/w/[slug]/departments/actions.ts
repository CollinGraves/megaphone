"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { departmentMembers, departmentRole, departments, memberships } from "@/db/schema";
import { departmentSlug } from "@/lib/departments";
import { canForDepartment, getDepartment } from "@/lib/departments.server";
import { featureGateMessage, hasFeature } from "@/lib/plans";
import type { ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction, zId, zOptText } from "../_lib/action-utils";

const nameSchema = z.string().trim().min(2, "Name: at least 2 characters.").max(60, "Name: 60 characters at most.");

function requireFeature(ctx: WorkspaceContext) {
  if (!hasFeature(ctx.org.plan, "departments")) throw new ActionError(featureGateMessage(ctx.org.plan, "departments"));
}

/** Resolve the department from the form and check the person may manage it (workspace admin or its lead). */
async function authorizeDepartment(form: FormData) {
  const ctx = await authorize(form, "workspace:view");
  requireFeature(ctx);
  const dept = await getDepartment(ctx.org.id, { id: zId().parse(form.get("departmentId")) });
  if (!dept) throw new ActionError("Department not found.");
  if (!(await canForDepartment(ctx, "departments:manage", dept.id))) throw new ActionError("Only workspace admins and this department's leads can do that.");
  return { ctx, dept };
}

export async function createDepartment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "departments:manage");
    requireFeature(ctx);
    const v = z.object({ name: nameSchema, description: zOptText(280) }).parse({ name: form.get("name"), description: form.get("description") ?? "" });
    const existing = await db.select({ slug: departments.slug, name: departments.name }).from(departments).where(eq(departments.orgId, ctx.org.id));
    if (existing.some((d) => d.name.toLowerCase() === v.name.toLowerCase())) throw new ActionError(`There's already a ${v.name} department.`);
    const [dept] = await db
      .insert(departments)
      .values({ orgId: ctx.org.id, name: v.name, slug: departmentSlug(v.name, new Set(existing.map((d) => d.slug))), description: v.description, createdById: ctx.user.id })
      .returning();
    await logActivity(ctx, "department.created", { name: dept.name });
    revalidateWorkspace(ctx.org.slug);
    redirect(`/w/${ctx.org.slug}/departments/${dept.slug}`);
  });
}

export async function updateDepartment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, dept } = await authorizeDepartment(form);
    const v = z.object({ name: nameSchema, description: zOptText(280) }).parse({ name: form.get("name"), description: form.get("description") ?? "" });
    await db.update(departments).set({ name: v.name, description: v.description, updatedAt: new Date() }).where(eq(departments.id, dept.id));
    if (v.name !== dept.name) await logActivity(ctx, "department.renamed", { from: dept.name, to: v.name });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Saved." };
  });
}

export async function deleteDepartment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "departments:manage");
    const dept = await getDepartment(ctx.org.id, { id: zId().parse(form.get("departmentId")) });
    if (!dept) throw new ActionError("Department not found.");
    // Initiatives and ideas stay; they become company-wide (department_id is set null).
    await db.delete(departments).where(eq(departments.id, dept.id));
    await logActivity(ctx, "department.deleted", { name: dept.name });
    revalidateWorkspace(ctx.org.slug);
    redirect(`/w/${ctx.org.slug}/departments`);
  });
}

const memberSchema = z.object({ userId: zId(), role: z.enum(departmentRole.enumValues) });

export async function addDepartmentMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, dept } = await authorizeDepartment(form);
    const v = memberSchema.parse({ userId: form.get("userId"), role: form.get("role") ?? "member" });
    const [member] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, v.userId)))
      .limit(1);
    if (!member) throw new ActionError("Only people in this workspace can join a department. Invite them to the workspace first.");
    await db
      .insert(departmentMembers)
      .values({ departmentId: dept.id, userId: v.userId, role: v.role })
      .onConflictDoUpdate({ target: [departmentMembers.departmentId, departmentMembers.userId], set: { role: v.role } });
    await logActivity(ctx, "department.member_added", { department: dept.name, userId: v.userId, role: v.role });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: v.role === "lead" ? "Lead added." : "Member added." };
  });
}

export async function setDepartmentRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, dept } = await authorizeDepartment(form);
    const v = memberSchema.parse({ userId: form.get("userId"), role: form.get("role") });
    if (v.role === "member" && v.userId === ctx.user.id && !ctx.can("departments:manage")) {
      throw new ActionError("Ask a workspace admin or another lead to change your own role.");
    }
    await db.update(departmentMembers).set({ role: v.role }).where(and(eq(departmentMembers.departmentId, dept.id), eq(departmentMembers.userId, v.userId)));
    await logActivity(ctx, "department.role_changed", { department: dept.name, userId: v.userId, role: v.role });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Role updated." };
  });
}

export async function removeDepartmentMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, dept } = await authorizeDepartment(form);
    const userId = zId().parse(form.get("userId"));
    await db.delete(departmentMembers).where(and(eq(departmentMembers.departmentId, dept.id), eq(departmentMembers.userId, userId)));
    await logActivity(ctx, "department.member_removed", { department: dept.name, userId });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Removed from the department." };
  });
}
