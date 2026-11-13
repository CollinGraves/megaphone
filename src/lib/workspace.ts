import "server-only";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { activityLog, consultantAssignments, memberships, organizations } from "@/db/schema";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { can, resolveWorkspaceAccess, type Capability, type WorkspaceAccess } from "@/lib/permissions";

export type WorkspaceContext = {
  user: CurrentUser;
  org: typeof organizations.$inferSelect;
  access: WorkspaceAccess;
  can: (capability: Capability) => boolean;
};

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
  }
}

const loadWorkspace = cache(async (slug: string): Promise<WorkspaceContext | null> => {
  const current = await getCurrentUser();
  if (!current) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
  if (!org) return null;

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, current.id)))
    .limit(1);
  const [assignment] =
    current.platformRole === "consultant"
      ? await db
          .select({ orgId: consultantAssignments.orgId })
          .from(consultantAssignments)
          .where(and(eq(consultantAssignments.orgId, org.id), eq(consultantAssignments.userId, current.id)))
          .limit(1)
      : [];

  const access = resolveWorkspaceAccess({
    platformRole: current.platformRole,
    membershipRole: membership?.role ?? null,
    isAssignedConsultant: Boolean(assignment),
  });
  if (!access) return null;
  // Suspended workspaces stay visible to North Labs staff only.
  if (org.status === "suspended" && access.via === "membership") return null;

  return { user: current, org, access, can: (cap) => can(access, cap) };
});

/** For pages: resolves the workspace or 404s (never reveals that a workspace exists). */
export async function getWorkspaceOrNotFound(slug: string): Promise<WorkspaceContext> {
  const current = await getCurrentUser();
  if (!current) redirect(`/sign-in?next=${encodeURIComponent(`/w/${slug}`)}`);
  const ctx = await loadWorkspace(slug);
  if (!ctx) notFound();
  return ctx;
}

/** For server actions: resolves the workspace and enforces a capability. */
export async function requireWorkspaceCapability(slug: string, capability: Capability): Promise<WorkspaceContext> {
  const ctx = await loadWorkspace(slug);
  if (!ctx || !ctx.can(capability)) throw new ForbiddenError();
  return ctx;
}

export async function logActivity(
  ctx: WorkspaceContext,
  action: string,
  detail?: Record<string, unknown>,
  initiativeId?: string,
) {
  await db.insert(activityLog).values({
    orgId: ctx.org.id,
    userId: ctx.user.id,
    initiativeId: initiativeId ?? null,
    action,
    detail: detail ?? null,
  });
}

/** Workspaces the current user can open (memberships + consultant assignments + everything for admins). */
export async function listAccessibleWorkspaces(current: CurrentUser) {
  if (current.platformRole === "admin") {
    return db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations)
      .orderBy(organizations.name);
  }
  const viaMembership = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.orgId, organizations.id))
    .where(and(eq(memberships.userId, current.id), eq(organizations.status, "active")));
  const viaConsulting =
    current.platformRole === "consultant"
      ? await db
          .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
          .from(consultantAssignments)
          .innerJoin(organizations, eq(consultantAssignments.orgId, organizations.id))
          .where(eq(consultantAssignments.userId, current.id))
      : [];
  const seen = new Map<string, { id: string; name: string; slug: string }>();
  for (const w of [...viaMembership, ...viaConsulting]) seen.set(w.id, w);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
