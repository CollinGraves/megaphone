import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { consultantAssignments, organizations, user } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";

export const isAdmin = (u: Pick<CurrentUser, "platformRole">) => u.platformRole === "admin";

/** Org ids a consultant is assigned to; `null` means "all" (platform admin). */
export async function visibleOrgIds(me: CurrentUser): Promise<string[] | null> {
  if (isAdmin(me)) return null;
  const rows = await db
    .select({ orgId: consultantAssignments.orgId })
    .from(consultantAssignments)
    .where(eq(consultantAssignments.userId, me.id));
  return rows.map((r) => r.orgId);
}

/** Loads an org the staff member may see in the admin console, or 404s (never leaks existence). */
export async function getVisibleOrgOrNotFound(me: CurrentUser, orgId: string) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) notFound();
  if (isAdmin(me)) return org;
  const [assigned] = await db
    .select({ orgId: consultantAssignments.orgId })
    .from(consultantAssignments)
    .where(and(eq(consultantAssignments.orgId, orgId), eq(consultantAssignments.userId, me.id)))
    .limit(1);
  if (!assigned) notFound();
  return org;
}

/** North Labs staff, for owner pickers and consultant assignment. */
export async function listStaff(roles: ("admin" | "consultant")[] = ["admin", "consultant"]) {
  return db
    .select({ id: user.id, name: user.name, email: user.email, platformRole: user.platformRole })
    .from(user)
    .where(inArray(user.platformRole, roles))
    .orderBy(user.name);
}
