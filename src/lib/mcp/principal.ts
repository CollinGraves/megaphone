import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, consultantAssignments, memberships, organizations, user } from "@/db/schema";
import { can, resolveWorkspaceAccess, type Capability, type WorkspaceAccess } from "@/lib/permissions";
import { BRAND } from "@/lib/brand";

export type Principal = {
  user: typeof user.$inferSelect;
  key: typeof apiKeys.$inferSelect;
  /** The workspace this key is scoped to, with the user's *current* role (null if none or access was lost). */
  workspace: { org: typeof organizations.$inferSelect; access: WorkspaceAccess } | null;
  canWrite: boolean;
};

export class McpAccessError extends Error {}

/** Resolve the calling user and their live workspace access from a verified key id. */
export async function loadPrincipal(keyId: string): Promise<Principal | null> {
  const [row] = await db.select({ key: apiKeys, user }).from(apiKeys).innerJoin(user, eq(user.id, apiKeys.userId)).where(eq(apiKeys.id, keyId)).limit(1);
  if (!row || row.key.revokedAt) return null;

  let workspace: Principal["workspace"] = null;
  if (row.key.orgId) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, row.key.orgId)).limit(1);
    if (org) {
      const [membership] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, row.user.id)))
        .limit(1);
      const [assignment] = await db
        .select({ orgId: consultantAssignments.orgId })
        .from(consultantAssignments)
        .where(and(eq(consultantAssignments.orgId, org.id), eq(consultantAssignments.userId, row.user.id)))
        .limit(1);
      const access = resolveWorkspaceAccess({
        platformRole: row.user.platformRole,
        membershipRole: membership?.role ?? null,
        isAssignedConsultant: Boolean(assignment),
      });
      const suspendedForClient = org.status === "suspended" && access?.via === "membership";
      if (access && !suspendedForClient) workspace = { org, access };
    }
  }
  return { user: row.user, key: row.key, workspace, canWrite: row.key.scopes.includes("write") };
}

/** Workspace tools: require a workspace-scoped key, a live role with the capability, and write scope for writes. */
export function requireWorkspace(p: Principal, capability: Capability, write = false) {
  if (!p.key.orgId) throw new McpAccessError(`This API key isn't connected to a workspace. Create a workspace-scoped key in ${BRAND} settings.`);
  if (!p.workspace) throw new McpAccessError("You no longer have access to the workspace this key is connected to.");
  if (write && !p.canWrite) throw new McpAccessError("This API key is read-only. Create a read-write key to make changes.");
  if (!can(p.workspace.access, capability)) throw new McpAccessError("Your workspace role doesn't allow this action.");
  return p.workspace;
}
