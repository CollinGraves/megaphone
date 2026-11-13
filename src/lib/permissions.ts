import type { OrgRole, PlatformRole } from "@/db/schema";

/**
 * Two layers of permission:
 *  1. Platform role (North Labs): admin sees everything; consultants see client workspaces they're assigned to.
 *  2. Workspace role (per client org): owner > admin > editor > viewer.
 */

export const CAPABILITIES = [
  "workspace:view",
  "initiative:write",
  "initiative:delete",
  "system:write",
  "impact:write",
  "comment:write",
  "members:manage",
  "settings:manage",
  "export",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

const ROLE_RANK: Record<OrgRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

const ROLE_CAPABILITIES: Record<OrgRole, readonly Capability[]> = {
  viewer: ["workspace:view", "comment:write", "export"],
  editor: ["workspace:view", "comment:write", "export", "initiative:write", "system:write", "impact:write"],
  admin: [
    "workspace:view",
    "comment:write",
    "export",
    "initiative:write",
    "initiative:delete",
    "system:write",
    "impact:write",
    "members:manage",
    "settings:manage",
  ],
  owner: CAPABILITIES,
};

export type AccessVia = "membership" | "consultant" | "platform_admin";
export type WorkspaceAccess = { role: OrgRole; via: AccessVia };

export function resolveWorkspaceAccess(input: {
  platformRole: PlatformRole;
  membershipRole: OrgRole | null;
  isAssignedConsultant: boolean;
}): WorkspaceAccess | null {
  const candidates: WorkspaceAccess[] = [];
  if (input.platformRole === "admin") candidates.push({ role: "owner", via: "platform_admin" });
  if (input.platformRole === "consultant" && input.isAssignedConsultant)
    candidates.push({ role: "admin", via: "consultant" });
  if (input.membershipRole) candidates.push({ role: input.membershipRole, via: "membership" });
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (ROLE_RANK[c.role] > ROLE_RANK[best.role] ? c : best));
}

export function can(access: WorkspaceAccess | null | undefined, capability: Capability): boolean {
  if (!access) return false;
  return ROLE_CAPABILITIES[access.role].includes(capability);
}

/** Can an actor with `actorRole` assign/remove `targetRole`? Only owners manage owners. */
export function canAssignRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (!ROLE_CAPABILITIES[actorRole].includes("members:manage")) return false;
  if (targetRole === "owner") return actorRole === "owner";
  return ROLE_RANK[actorRole] >= ROLE_RANK[targetRole];
}

export const isStaff = (role: PlatformRole | null | undefined) => role === "admin" || role === "consultant";
