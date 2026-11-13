import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, user } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/session";
import { classifyEmail } from "@/lib/email-domains";
import { isStaff } from "@/lib/permissions";
import type { CreationFacts } from "@/lib/workspace-creation";

type Db = Pick<typeof db, "select">;

export type DomainWorkspace = NonNullable<CreationFacts["domainFreeWorkspace"]> & { slug: string; isMember: boolean };

/** An active Free workspace that already has members from this company domain. */
export async function findDomainFreeWorkspace(tx: Db, me: CurrentUser): Promise<DomainWorkspace | null> {
  if (!me.companyDomain) return null;
  const [org] = await tx
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.orgId, organizations.id))
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(organizations.plan, "trial"), eq(organizations.status, "active"), eq(user.companyDomain, me.companyDomain)))
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (!org) return null;
  const [owner] = await tx
    .select({ name: user.name, domain: user.companyDomain })
    .from(memberships)
    .innerJoin(user, eq(user.id, memberships.userId))
    .where(and(eq(memberships.orgId, org.id), eq(memberships.role, "owner")))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  const [mine] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, me.id)))
    .limit(1);
  return { name: org.name, slug: org.slug, ownerName: owner?.name ?? null, ownerDomain: owner?.domain ?? null, isMember: Boolean(mine) };
}

export async function loadCreationFacts(tx: Db, me: CurrentUser): Promise<CreationFacts & { domainWorkspace: DomainWorkspace | null }> {
  const [[created], domainWorkspace] = await Promise.all([
    tx.select({ n: count() }).from(organizations).where(eq(organizations.createdById, me.id)),
    findDomainFreeWorkspace(tx, me),
  ]);
  return {
    isStaff: isStaff(me.platformRole),
    emailKind: classifyEmail(me.email),
    companyDomain: me.companyDomain,
    createdCount: created?.n ?? 0,
    domainFreeWorkspace: domainWorkspace,
    domainWorkspace,
  };
}
