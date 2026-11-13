import type { Metadata } from "next";
import Link from "next/link";
import { count, isNull } from "drizzle-orm";
import { ArrowDown, ArrowUp, Download, UserRoundSearch } from "lucide-react";
import { db } from "@/db";
import { contactRequests } from "@/db/schema";
import { Badge, Button, ButtonLink, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { LEAD_STATUSES, listLeads, type LeadSort } from "@/lib/leads";
import { categoryLabel, INDUSTRIES, industryLabel, vendorLabel } from "@/lib/taxonomy";
import { formatNumber, timeAgo } from "@/lib/utils";
import { listStaff } from "../_lib/access";
import { intParam, qs } from "../_lib/params";
import { LEAD_STATUS_LABELS, LeadStatusBadge, ScoreBadge } from "../_components/badges";
import { Pager } from "../_components/pager";
import { MIN_SCORE_OPTIONS, parseLeadFilters } from "./filters";
import { LeadsTabs } from "./tabs";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Leads" };

const PAGE_SIZE = 50;

export default async function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  const me = await requireStaff();
  const sp = await searchParams;
  const filters = parseLeadFilters(sp, me.id);
  const page = intParam(sp, "page", { min: 1, max: 10_000 }) ?? 1;

  const [leads, staff, [{ open }]] = await Promise.all([
    listLeads(filters),
    listStaff(),
    db.select({ open: count() }).from(contactRequests).where(isNull(contactRequests.handledAt)),
  ]);

  // Params that define the current view; reused for sorting, paging and export links.
  const view = {
    q: filters.search,
    status: filters.status,
    industry: filters.industry,
    minScore: filters.minScore,
    owner: typeof sp.owner === "string" ? sp.owner : undefined,
    sort: filters.sort === "score" ? undefined : filters.sort,
    dir: filters.dir,
  };
  const tiers = { hot: 0, warm: 0, cold: 0 };
  for (const l of leads) tiers[l.score.tier]++;
  const visible = leads.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = Boolean(filters.search || filters.status || filters.industry || filters.minScore || view.owner);

  const sortHeader = (sort: LeadSort, label: string, className?: string) => {
    const active = filters.sort === sort;
    const defaultDir = sort === "name" || sort === "company" ? "asc" : "desc";
    const currentDir = filters.dir ?? defaultDir;
    const nextDir = active ? (currentDir === "asc" ? "desc" : "asc") : defaultDir;
    const href = `/admin/leads${qs({ ...view, sort: sort === "score" ? undefined : sort, dir: nextDir === defaultDir ? undefined : nextDir })}`;
    return (
      <Th className={className} aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : undefined}>
        <Link href={href} className="inline-flex items-center gap-1 hover:text-slate-800">
          {label}
          {active ? (
            currentDir === "asc" ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />
          ) : null}
        </Link>
      </Th>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Lead pipeline"
        description={`Everyone who signed up for ${BRAND}, scored by fit and engagement. Hover a score to see why.`}
        actions={
          <ButtonLink href={`/admin/leads/export${qs(view)}`} variant="secondary" prefetch={false}>
            <Download className="size-4" aria-hidden /> Export CSV
          </ButtonLink>
        }
      />
      <LeadsTabs active="leads" openRequests={open} />

      <Card className="mb-4">
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(4,1fr)_auto]">
          <Input name="q" type="search" placeholder="Search name, email, company, title…" defaultValue={filters.search} aria-label="Search" />
          <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select name="industry" defaultValue={filters.industry ?? ""} aria-label="Industry">
            <option value="">All industries</option>
            {INDUSTRIES.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.label}
              </option>
            ))}
          </Select>
          <Select name="minScore" defaultValue={filters.minScore?.toString() ?? ""} aria-label="Minimum score">
            <option value="">Any score</option>
            {MIN_SCORE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                Score ≥ {n}
                {n === 70 ? " (hot)" : n === 40 ? " (warm+)" : ""}
              </option>
            ))}
          </Select>
          <Select name="owner" defaultValue={view.owner ?? ""} aria-label="Owner">
            <option value="">Any owner</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {staff
              .filter((s) => s.id !== me.id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
          <div className="flex gap-2">
            {view.sort ? <input type="hidden" name="sort" value={view.sort} /> : null}
            {view.dir ? <input type="hidden" name="dir" value={view.dir} /> : null}
            <Button type="submit" className="flex-1">
              Filter
            </Button>
            {hasFilters ? (
              <ButtonLink href="/admin/leads" variant="ghost">
                Reset
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span className="font-medium text-slate-900 tabular-nums">{formatNumber(leads.length)} leads</span>
        <Badge tone="red">{tiers.hot} hot</Badge>
        <Badge tone="amber">{tiers.warm} warm</Badge>
        <Badge tone="neutral">{tiers.cold} cold</Badge>
      </div>

      {leads.length === 0 ? (
        <EmptyState
          icon={<UserRoundSearch className="size-6" />}
          title={hasFilters ? "No leads match these filters" : "No leads yet"}
          description={hasFilters ? "Try widening your filters." : `People who sign up for ${BRAND} show up here.`}
        />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                {sortHeader("name", "Lead")}
                {sortHeader("score", "Score")}
                <Th>Status</Th>
                {sortHeader("company", "Company")}
                <Th className="hidden lg:table-cell">Industry</Th>
                <Th className="hidden xl:table-cell">Interests</Th>
                {sortHeader("activity", "Last activity")}
                <Th className="hidden md:table-cell">Owner</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lead) => {
                const interests = [
                  ...lead.interests.categories.map(categoryLabel),
                  ...lead.interests.vendors.map(vendorLabel),
                ];
                return (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <Td className="max-w-64">
                      <Link href={`/admin/leads/${lead.id}`} className="block font-medium text-slate-900 hover:text-radar-700">
                        {lead.name}
                      </Link>
                      <div className="truncate text-xs text-slate-500">{lead.jobTitle ?? lead.email}</div>
                    </Td>
                    <Td>
                      <ScoreBadge score={lead.score} />
                    </Td>
                    <Td>
                      <LeadStatusBadge status={lead.status} />
                    </Td>
                    <Td className="max-w-56">
                      <div className="truncate">{lead.company ?? <span className="text-slate-400">—</span>}</div>
                      {lead.companySize ? <div className="text-xs text-slate-500">{lead.companySize} employees</div> : null}
                    </Td>
                    <Td className="hidden lg:table-cell">
                      {lead.industry ? industryLabel(lead.industry) : <span className="text-slate-400">—</span>}
                    </Td>
                    <Td className="hidden max-w-64 xl:table-cell">
                      {interests.length ? (
                        <div className="flex flex-wrap gap-1">
                          {interests.slice(0, 3).map((i) => (
                            <Badge key={i}>{i}</Badge>
                          ))}
                          {interests.length > 3 ? <Badge>+{interests.length - 3}</Badge> : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {lead.lastActivityAt ? timeAgo(lead.lastActivityAt) : "—"}
                    </Td>
                    <Td className="hidden whitespace-nowrap md:table-cell">
                      {lead.ownerName ?? <span className="text-slate-400">Unassigned</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pager basePath="/admin/leads" params={view} page={page} pageSize={PAGE_SIZE} total={leads.length} />
        </Card>
      )}
    </>
  );
}
