import "server-only";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { joinRequests, memberships, organizations, user } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { classifyEmail } from "@/lib/email-domains";
import { isStaff } from "@/lib/permissions";
import type { CreationFacts } from "@/lib/workspace-creation";

type Db = Pick<typeof db, "select">;

export type DomainWorkspace = NonNullable<CreationFacts["domainWorkspace"]> & {
  id: string;
  slug: string;
  isMember: boolean;
  /** This person's open request to join, if any. */
  pendingRequest: { id: string; createdAt: Date } | null;
};

/** The active workspace that belongs to this person's company domain (oldest first), any plan. */
export async function findDomainWorkspace(tx: Db, me: CurrentUser): Promise<DomainWorkspace | null> {
  if (!me.companyDomain) return null;
  const [org] = await tx
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(and(eq(organizations.emailDomain, me.companyDomain), eq(organizations.status, "active")))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (!org) return null;
  const [[owner], [mine], [pending]] = await Promise.all([
    tx
      .select({ name: user.name, domain: user.companyDomain })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(and(eq(memberships.orgId, org.id), eq(memberships.role, "owner")))
      .orderBy(asc(memberships.createdAt))
      .limit(1),
    tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, me.id)))
      .limit(1),
    tx
      .select({ id: joinRequests.id, createdAt: joinRequests.createdAt })
      .from(joinRequests)
      .where(and(eq(joinRequests.orgId, org.id), eq(joinRequests.userId, me.id), eq(joinRequests.status, "pending")))
      .orderBy(desc(joinRequests.createdAt))
      .limit(1),
  ]);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    ownerName: owner?.name ?? null,
    ownerDomain: owner?.domain ?? null,
    isMember: Boolean(mine),
    pendingRequest: pending ?? null,
  };
}

export async function loadCreationFacts(tx: Db, me: CurrentUser): Promise<CreationFacts & { domainWorkspace: DomainWorkspace | null }> {
  const [[created], domainWorkspace] = await Promise.all([
    tx.select({ n: count() }).from(organizations).where(eq(organizations.createdById, me.id)),
    findDomainWorkspace(tx, me),
  ]);
  return {
    isStaff: isStaff(me.platformRole),
    emailKind: classifyEmail(me.email),
    companyDomain: me.companyDomain,
    createdCount: created?.n ?? 0,
    domainWorkspace,
  };
}
