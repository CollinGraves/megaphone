"use server";

import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { consultantAssignments, invitations, memberships, organizations, orgPlan, orgRole, orgStatus, user } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createInvitation } from "@/lib/invitations";
import { INDUSTRY_SLUGS } from "@/lib/taxonomy";
import type { ActionState } from "@/lib/utils";

/* All workspace administration from the console is restricted to platform admins.
 * Assigned consultants see these pages read-only and work inside /w/<slug> instead. */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(["new", "admin", "api", "settings", "invite", "app", "www"]);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug must be at least 2 characters.")
  .max(48, "Slug must be at most 48 characters.")
  .regex(SLUG_RE, "Slug may only contain lowercase letters, numbers and single hyphens.")
  .refine((s) => !RESERVED_SLUGS.has(s), "That slug is reserved.");

const optionalIndustry = z
  .string()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || (INDUSTRY_SLUGS as string[]).includes(v), "Unknown industry.");

const hourlyRate = z.coerce
  .number({ error: "Hourly rate must be a number." })
  .min(0, "Hourly rate can't be negative.")
  .max(10_000, "Hourly rate looks too high.");

const firstIssue = (error: z.ZodError) => error.issues[0]?.message ?? "Invalid input.";
const orgIdSchema = z.string().min(1).max(64);

async function staffConsultantIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, ids), eq(user.platformRole, "consultant")));
  return rows.map((r) => r.id);
}

function revalidateOrg(orgId: string, slug?: string) {
  revalidatePath("/admin/workspaces");
  revalidatePath(`/admin/workspaces/${orgId}`);
  revalidatePath("/admin");
  if (slug) revalidatePath(`/w/${slug}`, "layout");
}

/* ───────────────────────────── Provisioning ───────────────────────────── */

export type ProvisionValues = {
  industry: string;
  plan: string;
  defaultHourlyRate: string;
  ownerEmail: string;
  consultantIds: string[];
};

export type ProvisionState = {
  error?: string;
  /** Echoed back on error so the form keeps what was typed (React resets forms after an action). */
  values?: ProvisionValues;
  org?: { id: string; name: string; slug: string };
  invite?: { email: string; status: "added" | "invited"; url?: string };
  inviteError?: string;
} | null;

const provisionSchema = z.object({
  name: z.string().trim().min(2, "Workspace name is required.").max(120),
  slug: slugSchema,
  industry: optionalIndustry,
  plan: z.enum(orgPlan.enumValues),
  defaultHourlyRate: hourlyRate,
  ownerEmail: z.email("Enter a valid owner email.").trim().toLowerCase(),
  consultantIds: z.array(z.string().max(64)).max(50),
});

export async function provisionWorkspace(_prev: ProvisionState, form: FormData): Promise<ProvisionState> {
  const me = await requirePlatformAdmin();
  const values: ProvisionValues = {
    industry: String(form.get("industry") ?? ""),
    plan: String(form.get("plan") ?? ""),
    defaultHourlyRate: String(form.get("defaultHourlyRate") ?? ""),
    ownerEmail: String(form.get("ownerEmail") ?? "").trim(),
    consultantIds: form.getAll("consultantIds").filter((v): v is string => typeof v === "string"),
  };
  const parsed = provisionSchema.safeParse({
    ...values,
    name: form.get("name") ?? "",
    slug: form.get("slug") ?? "",
    defaultHourlyRate: values.defaultHourlyRate || 75,
  });
  if (!parsed.success) return { error: firstIssue(parsed.error), values };
  const input = parsed.data;

  const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, input.slug)).limit(1);
  if (taken) return { error: `The slug “${input.slug}” is already in use.`, values };

  const consultants = await staffConsultantIds(input.consultantIds);
  const org = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(organizations)
      .values({
        name: input.name,
        slug: input.slug,
        industry: input.industry,
        plan: input.plan,
        defaultHourlyRate: input.defaultHourlyRate,
        provisionedById: me.id,
      })
      .returning({ id: organizations.id, name: organizations.name, slug: organizations.slug });
    if (consultants.length) {
      await tx.insert(consultantAssignments).values(consultants.map((userId) => ({ orgId: created.id, userId })));
    }
    return created;
  });

  revalidateOrg(org.id);
  try {
    const invite = await createInvitation({
      orgId: org.id,
      email: input.ownerEmail,
      role: "owner",
      invitedById: me.id,
      invitedByName: me.name,
    });
    return { org, invite: { email: input.ownerEmail, ...invite } };
  } catch (err) {
    // The workspace exists; the owner can be re-invited from its detail page.
    return { org, inviteError: err instanceof Error ? err.message : "Could not send the owner invitation." };
  }
}

/* ───────────────────────────── Settings & status ───────────────────────────── */

const settingsSchema = z.object({
  name: z.string().trim().min(2, "Workspace name is required.").max(120),
  industry: optionalIndustry,
  plan: z.enum(orgPlan.enumValues),
  defaultHourlyRate: hourlyRate,
});

export async function updateWorkspaceSettings(orgId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const parsed = settingsSchema.safeParse({
    name: form.get("name") ?? "",
    industry: form.get("industry") ?? "",
    plan: form.get("plan"),
    defaultHourlyRate: form.get("defaultHourlyRate"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const [updated] = await db
    .update(organizations)
    .set(parsed.data)
    .where(eq(organizations.id, orgIdSchema.parse(orgId)))
    .returning({ slug: organizations.slug });
  if (!updated) return { error: "Workspace not found." };
  revalidateOrg(orgId, updated.slug);
  return { ok: true, message: "Workspace settings saved." };
}

export async function setWorkspaceStatus(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { orgId, status } = z
    .object({ orgId: orgIdSchema, status: z.enum(orgStatus.enumValues) })
    .parse({ orgId: form.get("orgId"), status: form.get("status") });
  const [updated] = await db
    .update(organizations)
    .set({ status })
    .where(eq(organizations.id, orgId))
    .returning({ slug: organizations.slug });
  if (updated) revalidateOrg(orgId, updated.slug);
}

/* ───────────────────────────── Consultants ───────────────────────────── */

export async function assignConsultant(orgId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const userId = z.string().min(1, "Choose a consultant.").max(64).safeParse(form.get("userId") ?? "");
  if (!userId.success) return { error: firstIssue(userId.error) };
  const [valid] = await staffConsultantIds([userId.data]);
  if (!valid) return { error: "Only users with the consultant role can be assigned." };
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return { error: "Workspace not found." };
  await db.insert(consultantAssignments).values({ orgId, userId: valid }).onConflictDoNothing();
  revalidateOrg(orgId);
  return { ok: true, message: "Consultant assigned." };
}

export async function unassignConsultant(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { orgId, userId } = z
    .object({ orgId: orgIdSchema, userId: z.string().min(1).max(64) })
    .parse({ orgId: form.get("orgId"), userId: form.get("userId") });
  await db
    .delete(consultantAssignments)
    .where(and(eq(consultantAssignments.orgId, orgId), eq(consultantAssignments.userId, userId)));
  revalidateOrg(orgId);
}

/* ───────────────────────────── Members & invitations ───────────────────────────── */

export type InviteState = { error?: string; ok?: boolean; message?: string; url?: string } | null;

const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  role: z.enum(orgRole.enumValues),
});

export async function inviteMember(orgId: string, _prev: InviteState, form: FormData): Promise<InviteState> {
  const me = await requirePlatformAdmin();
  const parsed = inviteSchema.safeParse({ email: String(form.get("email") ?? "").trim(), role: form.get("role") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  try {
    const result = await createInvitation({ orgId, email: parsed.data.email, role: parsed.data.role, invitedById: me.id, invitedByName: me.name });
    revalidateOrg(orgId);
    return result.status === "added"
      ? { ok: true, message: `${parsed.data.email} already had an account and was added to the workspace.` }
      : { ok: true, message: `Invitation sent to ${parsed.data.email}. You can also share this link:`, url: result.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the invitation." };
  }
}

export async function revokeInvitation(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { orgId, invitationId } = z
    .object({ orgId: orgIdSchema, invitationId: z.string().min(1).max(64) })
    .parse({ orgId: form.get("orgId"), invitationId: form.get("invitationId") });
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), eq(invitations.orgId, orgId), isNull(invitations.acceptedAt)));
  revalidateOrg(orgId);
}

async function ownerCount(orgId: string) {
  const [{ owners }] = await db
    .select({ owners: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
  return owners;
}

const memberSchema = z.object({ orgId: orgIdSchema, userId: z.string().min(1).max(64) });
const LAST_OWNER = "A workspace must keep at least one owner. Make someone else an owner first.";

async function currentMemberRole(orgId: string, userId: string) {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function updateMemberRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const parsed = memberSchema
    .extend({ role: z.enum(orgRole.enumValues) })
    .safeParse({ orgId: form.get("orgId"), userId: form.get("userId"), role: form.get("role") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { orgId, userId, role } = parsed.data;
  const current = await currentMemberRole(orgId, userId);
  if (!current) return { error: "Member not found." };
  if (current === role) return { ok: true };
  if (current === "owner" && (await ownerCount(orgId)) <= 1) return { error: LAST_OWNER };
  await db.update(memberships).set({ role }).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  revalidateOrg(orgId);
  return { ok: true };
}

export async function removeMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const parsed = memberSchema.safeParse({ orgId: form.get("orgId"), userId: form.get("userId") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { orgId, userId } = parsed.data;
  const current = await currentMemberRole(orgId, userId);
  if (!current) return { ok: true };
  if (current === "owner" && (await ownerCount(orgId)) <= 1) return { error: LAST_OWNER };
  await db.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
  revalidateOrg(orgId);
  return { ok: true };
}
