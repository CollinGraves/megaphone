import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Building2, ExternalLink, Plus } from "lucide-react";
import { db } from "@/db";
import { consultantAssignments, initiatives, memberships, organizations, user } from "@/db/schema";
import { ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { industryLabel } from "@/lib/taxonomy";
import { formatDate } from "@/lib/utils";
import { isAdmin, visibleOrgIds } from "../_lib/access";
import { OrgStatusBadge, PlanBadge } from "../_components/badges";

export const metadata: Metadata = { title: "Workspaces" };

export default async function WorkspacesPage() {
  const me = await requireStaff();
  const admin = isAdmin(me);
  const orgIds = await visibleOrgIds(me);
  const scope = orgIds === null ? undefined : inArray(organizations.id, orgIds.length ? orgIds : [""]);

  const orgs = await db.select().from(organizations).where(scope).orderBy(desc(organizations.createdAt));
  const ids = orgs.map((o) => o.id);

  const [memberCounts, initiativeCounts, consultants] = ids.length
    ? await Promise.all([
        db
          .select({ orgId: memberships.orgId, n: count() })
          .from(memberships)
          .where(inArray(memberships.orgId, ids))
          .groupBy(memberships.orgId),
        db
          .select({ orgId: initiatives.orgId, n: count() })
          .from(initiatives)
          .where(and(inArray(initiatives.orgId, ids), isNull(initiatives.archivedAt)))
          .groupBy(initiatives.orgId),
        db
          .select({ orgId: consultantAssignments.orgId, name: user.name })
          .from(consultantAssignments)
          .innerJoin(user, eq(user.id, consultantAssignments.userId))
          .where(inArray(consultantAssignments.orgId, ids))
          .orderBy(user.name),
      ])
    : [[], [], []];

  const members = new Map(memberCounts.map((r) => [r.orgId, r.n]));
  const inits = new Map(initiativeCounts.map((r) => [r.orgId, r.n]));
  const consultantsByOrg = new Map<string, string[]>();
  for (const c of consultants) consultantsByOrg.set(c.orgId, [...(consultantsByOrg.get(c.orgId) ?? []), c.name]);

  return (
    <>
      <PageHeader
        eyebrow="Workspaces"
        title={admin ? "Client workspaces" : "Your client workspaces"}
        description={
          admin
            ? "Workspaces provisioned by North Labs. Provision a new client, assign consultants and manage access."
            : "Workspaces you're assigned to as a consultant."
        }
        actions={
          admin ? (
            <ButtonLink href="/admin/workspaces/new" variant="accent">
              <Plus className="size-4" aria-hidden /> Provision workspace
            </ButtonLink>
          ) : null
        }
      />

      {orgs.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title="No workspaces yet"
          description={admin ? "Provision the first client workspace to get started." : "You haven't been assigned to a client workspace yet."}
          action={
            admin ? (
              <ButtonLink href="/admin/workspaces/new" variant="accent">
                Provision workspace
              </ButtonLink>
            ) : null
          }
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Workspace</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th className="text-right">Members</Th>
                <Th className="text-right">Initiatives</Th>
                <Th className="hidden md:table-cell">Consultants</Th>
                <Th className="hidden lg:table-cell">Created</Th>
                <Th className="relative">
                  <span className="sr-only">Open</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => {
                const names = consultantsByOrg.get(org.id) ?? [];
                return (
                  <tr key={org.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/admin/workspaces/${org.id}`} className="font-medium text-slate-900 hover:text-radar-700">
                        {org.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        /w/{org.slug}
                        {org.industry ? ` · ${industryLabel(org.industry)}` : ""}
                      </div>
                    </Td>
                    <Td>
                      <PlanBadge plan={org.plan} />
                    </Td>
                    <Td>
                      <OrgStatusBadge status={org.status} />
                    </Td>
                    <Td className="text-right tabular-nums">{members.get(org.id) ?? 0}</Td>
                    <Td className="text-right tabular-nums">{inits.get(org.id) ?? 0}</Td>
                    <Td className="hidden max-w-56 md:table-cell">
                      {names.length ? <span className="line-clamp-2">{names.join(", ")}</span> : <span className="text-slate-400">None</span>}
                    </Td>
                    <Td className="hidden whitespace-nowrap text-slate-500 lg:table-cell">{formatDate(org.createdAt)}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/w/${org.slug}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline"
                        title={`Open /w/${org.slug}`}
                      >
                        Open <ExternalLink className="size-3.5" aria-hidden />
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
