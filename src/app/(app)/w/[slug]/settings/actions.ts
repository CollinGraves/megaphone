"use server";

import { and, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { departmentMembers, departments, invitations, memberships, orgRole, organizations, user, type OrgRole } from "@/db/schema";
import { createInvitation } from "@/lib/invitations";
import { decideJoinRequest, JoinRequestError } from "@/lib/join-requests";
import { deleteWorkspace, DeletionBlocked } from "@/lib/deletion";
import { canAssignRole } from "@/lib/permissions";
import { INDUSTRY_SLUGS, ORG_ROLES, labelFrom } from "@/lib/taxonomy";
import type { ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction, zId, zOptNumber } from "../_lib/action-utils";
import { BRAND } from "@/lib/brand";

/* ───────────────────────────── Workspace profile & scoring ───────────────────────────── */

const profileSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(120),
  industry: z.preprocess((v) => (v === "" ? null : v), z.enum(INDUSTRY_SLUGS as [string, ...string[]]).nullable()),
  defaultHourlyRate: zOptNumber({ min: 1, max: 10_000 }).refine((v) => v != null, "is required"),
});

export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const v = profileSchema.parse({ name: form.get("name") ?? "", industry: form.get("industry") ?? "", defaultHourlyRate: form.get("defaultHourlyRate") });
    await db
      .update(organizations)
      .set({ name: v.name, industry: v.industry, defaultHourlyRate: v.defaultHourlyRate! })
      .where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "settings.updated", { name: v.name, industry: v.industry, defaultHourlyRate: v.defaultHourlyRate });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Workspace settings saved." };
  });
}

const weight = () => zOptNumber({ min: 0, max: 100 }).transform((v) => v ?? 0);
const weightsSchema = z.object({ value: weight(), feasibility: weight(), alignment: weight(), risk: weight() });

export async function updateWeights(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const w = weightsSchema.parse({ value: form.get("value"), feasibility: form.get("feasibility"), alignment: form.get("alignment"), risk: form.get("risk") });
    const total = w.value + w.feasibility + w.alignment + w.risk;
    if (total <= 0) throw new ActionError("At least one weight must be greater than zero.");
    const normalized = {
      value: w.value / total,
      feasibility: w.feasibility / total,
      alignment: w.alignment / total,
      risk: w.risk / total,
    };
    await db.update(organizations).set({ scoringWeights: normalized }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "weights.updated", normalized);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: total === 100 ? "Weights saved." : `Weights saved (normalized from a total of ${total} to 100%).` };
  });
}

/**
 * Opt in/out of anonymized aggregate research (the show's by-the-numbers segment, reports). Only the client's
 * own owners decide this: North Labs staff benefit from the data, so their platform access doesn't count.
 */
export async function updateInsightsSharing(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const [own] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, ctx.user.id), eq(memberships.role, "owner")))
      .limit(1);
    if (!own) throw new ActionError("Only an owner who is a member of this workspace can change data sharing.");
    const share = form.get("share") === "1";
    await db.update(organizations).set({ shareAggregateInsights: share }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "settings.insights_sharing", { share });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: share ? "Thanks! Anonymized aggregates from this workspace can now be included." : "Data sharing turned off." };
  });
}

/* ───────────────────────────── Members & invitations ───────────────────────────── */

const roleSchema = z.enum(orgRole.enumValues);

async function getMember(ctx: WorkspaceContext, userId: string) {
  const [row] = await db
    .select({ role: memberships.role, name: user.name, email: user.email, userId: memberships.userId })
    .from(memberships)
    .innerJoin(user, eq(memberships.userId, user.id))
    .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, userId)))
    .limit(1);
  if (!row) throw new ActionError("Member not found.");
  return row;
}

async function assertNotLastOwner(ctx: WorkspaceContext, userId: string) {
  const [other] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.role, "owner"), ne(memberships.userId, userId)))
    .limit(1);
  if (!other) throw new ActionError("A workspace needs at least one owner. Make someone else an owner first.");
}

function assertCanManage(ctx: WorkspaceContext, role: OrgRole) {
  if (!canAssignRole(ctx.access.role, role)) {
    throw new ActionError(`Only ${role === "owner" ? "owners" : "admins and owners"} can manage ${labelFrom(ORG_ROLES, role).toLowerCase()}s.`);
  }
}

export async function inviteMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "members:manage");
    const email = z.email("must be a valid email").max(254).parse(String(form.get("email") ?? "").trim().toLowerCase());
    const role = roleSchema.parse(form.get("role"));
    assertCanManage(ctx, role);
    const result = await createInvitation({ orgId: ctx.org.id, email, role, invitedById: ctx.user.id, invitedByName: ctx.user.name });
    await logActivity(ctx, result.status === "added" ? "member.added" : "member.invited", { email, role });
    revalidateWorkspace(ctx.org.slug);
    return {
      ok: true,
      message:
        result.status === "added"
          ? `${email} already has an ${BRAND} account and was added as ${labelFrom(ORG_ROLES, role).toLowerCase()}.`
          : `Invitation emailed to ${email}. You can also copy the link from the pending invitations list.`,
    };
  });
}

export async function changeRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "members:manage");
    const member = await getMember(ctx, zId().parse(form.get("userId")));
    const role = roleSchema.parse(form.get("role"));
    if (role === member.role) return { ok: true };
    assertCanManage(ctx, member.role);
    assertCanManage(ctx, role);
    if (member.role === "owner") await assertNotLastOwner(ctx, member.userId);
    await db.update(memberships).set({ role }).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, member.userId)));
    await logActivity(ctx, "member.role_changed", { name: member.name, email: member.email, role });
    revalidateWorkspace(ctx.org.slug);
  });
}

export async function removeMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "members:manage");
    const member = await getMember(ctx, zId().parse(form.get("userId")));
    assertCanManage(ctx, member.role);
    if (member.role === "owner") await assertNotLastOwner(ctx, member.userId);
    await db.transaction(async (tx) => {
      await tx.delete(memberships).where(and(eq(memberships.orgId, ctx.org.id), eq(memberships.userId, member.userId)));
      // Leaving the workspace means leaving its departments too.
      await tx
        .delete(departmentMembers)
        .where(
          and(
            eq(departmentMembers.userId, member.userId),
            inArray(departmentMembers.departmentId, tx.select({ id: departments.id }).from(departments).where(eq(departments.orgId, ctx.org.id))),
          ),
        );
    });
    await logActivity(ctx, "member.removed", { name: member.name, email: member.email });
    revalidateWorkspace(ctx.org.slug);
    // Removing yourself (as a plain member) ends your access.
    if (member.userId === ctx.user.id && ctx.access.via === "membership") redirect("/home");
  });
}

export async function revokeInvitation(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "members:manage");
    const [inv] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, zId().parse(form.get("id"))),
          eq(invitations.orgId, ctx.org.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!inv) throw new ActionError("Invitation not found or no longer pending.");
    assertCanManage(ctx, inv.role);
    await db.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, inv.id));
    await logActivity(ctx, "invitation.revoked", { email: inv.email, role: inv.role });
    revalidateWorkspace(ctx.org.slug);
  });
}

/* ───────────────────────────── Join requests ───────────────────────────── */

export async function decideJoinRequestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "members:manage");
    const v = z
      .object({ requestId: zId(), decision: z.enum(["approve", "decline"]), role: roleSchema.default("editor") })
      .parse({ requestId: form.get("requestId"), decision: form.get("decision"), role: form.get("role") ?? undefined });
    if (v.decision === "approve" && !canAssignRole(ctx.access.role, v.role)) {
      throw new ActionError(`Your role can't add people as ${labelFrom(ORG_ROLES, v.role).toLowerCase()}.`);
    }
    try {
      await decideJoinRequest({ orgId: ctx.org.id, requestId: v.requestId, decision: v.decision, role: v.role, actor: ctx.user });
    } catch (err) {
      if (err instanceof JoinRequestError) throw new ActionError(err.message);
      throw err;
    }
    revalidateWorkspace(ctx.org.slug);
    // The request's row disappears once handled, so confirm at the top of the page instead.
    redirect(`/w/${ctx.org.slug}/settings?request=${v.decision === "approve" ? `approved&role=${v.role}` : "declined"}`);
  });
}

/* ───────────────────────────── Delete workspace ───────────────────────────── */

export async function deleteWorkspaceAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    if (String(form.get("confirm") ?? "").trim() !== ctx.org.slug) throw new ActionError(`Type ${ctx.org.slug} to confirm.`);
    try {
      await deleteWorkspace(ctx.org.id, ctx.user);
    } catch (err) {
      if (err instanceof DeletionBlocked) throw new ActionError(err.message);
      throw err;
    }
    redirect("/home?deleted=workspace");
  });
}

/* ───────────────────────────── Monthly update email ───────────────────────────── */

export async function updateMonthlyReport(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const on = form.get("on") === "1";
    await db.update(organizations).set({ monthlyReport: on }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "settings.monthly_report", { on });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: on ? "Owners and admins will get the monthly update by email." : "Monthly update emails are off. The page is still there any time." };
  });
}
