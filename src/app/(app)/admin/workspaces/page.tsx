import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Building2, ExternalLink, Plus } from "lucide-react";
import { db } from "@/db";
import { consultantAssignments, initiatives, memberships, organizations, user } from "@/db/schema";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { STALLED_AFTER_DAYS, loadActivations, type Activation } from "@/lib/onboarding";
import { industryLabel } from "@/lib/taxonomy";
import { cn, formatDate } from "@/lib/utils";
import { isAdmin, visibleOrgIds } from "../_lib/access";
import { oneOf, param } from "../_lib/params";
import { OrgStatusBadge, PlanBadge } from "../_components/badges";

export const metadata: Metadata = { title: "Workspaces" };

const ACTIVATION_FILTERS = ["stalled", "not_activated"] as const;
type ActivationFilter = (typeof ACTIVATION_FILTERS)[number];

export default async function WorkspacesPage({ searchParams }: PageProps<"/admin/workspaces">) {
  const sp = await searchParams;
  const filter = oneOf(param(sp, "activation"), ACTIVATION_FILTERS);
  const me = await requireStaff();
  const admin = isAdmin(me);
  const orgIds = await visibleOrgIds(me);
  const scope = orgIds === null ? undefined : inArray(organizations.id, orgIds.length ? orgIds : [""]);

  const allOrgs = await db.select().from(organizations).where(scope).orderBy(desc(organizations.createdAt));
  const activations = await loadActivations(allOrgs.map((o) => o.id));
  const matches = (id: string, f: ActivationFilter) => {
    const a = activations.get(id);
    return f === "stalled" ? Boolean(a?.stalled) : !a?.activated;
  };
  const stalledCount = allOrgs.filter((o) => matches(o.id, "stalled")).length;
  const notActivatedCount = allOrgs.filter((o) => matches(o.id, "not_activated")).length;
  const orgs = filter ? allOrgs.filter((o) => matches(o.id, filter)) : allOrgs;
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

      {allOrgs.length > 0 ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex gap-1 self-start rounded-lg bg-slate-100 p-1">
            <FilterTab href="/admin/workspaces" active={!filter} label="All" count={allOrgs.length} />
            <FilterTab href="/admin/workspaces?activation=stalled" active={filter === "stalled"} label="Stalled" count={stalledCount} highlight />
            <FilterTab href="/admin/workspaces?activation=not_activated" active={filter === "not_activated"} label="Not activated" count={notActivatedCount} />
          </div>
          <p className="text-xs text-slate-500">
            Stalled: self-serve, over {STALLED_AFTER_DAYS} days old, fewer than 3 setup steps done. Good Guided Launch candidates.
          </p>
        </div>
      ) : null}

      {orgs.length === 0 && filter ? (
        <EmptyState
          icon={<Building2 className="size-6" />}
          title={filter === "stalled" ? "No stalled workspaces" : "Every workspace is activated"}
          description="Nothing needs outreach right now."
          action={
            <ButtonLink href="/admin/workspaces" variant="secondary">
              Show all workspaces
            </ButtonLink>
          }
        />
      ) : orgs.length === 0 ? (
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
                <Th>Activation</Th>
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
                    <Td>
                      <ActivationCell activation={activations.get(org.id)} />
                    </Td>
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

function FilterTab({ href, active, label, count, highlight }: { href: string; active: boolean; label: string; count: number; highlight?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium",
        active ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200" : "text-slate-600 hover:text-slate-900",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
          highlight && count > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-700",
        )}
      >
        {count}
      </span>
    </Link>
  );
}

function ActivationCell({ activation: a }: { activation?: Activation }) {
  if (!a) return <span className="text-slate-400">—</span>;
  const missing = a.steps.filter((s) => !s.optional && !s.done).map((s) => s.title);
  const title = missing.length ? `To do: ${missing.join(", ")}` : "All setup steps done";
  return (
    <div className="min-w-28" title={title}>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <span className={cn("block h-full rounded-full", a.stalled ? "bg-amber-400" : "bg-radar-500")} style={{ width: `${a.percent}%` }} />
        </span>
        <span className="text-xs tabular-nums text-slate-700">
          {a.coreDone}/{a.coreTotal}
        </span>
        <span className="sr-only">setup steps done. {title}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {a.stalled ? <Badge tone="amber">Stalled · {a.ageDays}d</Badge> : a.activated ? <Badge tone="radar">Activated</Badge> : null}
        {a.dismissed && !a.complete ? <Badge>Checklist hidden</Badge> : null}
      </div>
    </div>
  );
}
