import { Archive, Download, ListChecks, Pin, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, EmptyState, Input, PageHeader, Select, Table, Td, Th, buttonClass } from "@/components/ui";
import { HEALTH, STAGES } from "@/lib/taxonomy";
import { cn, formatUsd } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { HealthBadge, PLATFORM_OPTIONS, PlatformList, ScorePill, StageBadge } from "../_components/badges";
import { loadPortfolio } from "../_lib/portfolio";

export const metadata: Metadata = { title: "Initiatives" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export default async function InitiativesPage({ params, searchParams }: PageProps<"/w/[slug]/initiatives">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;

  const filters = {
    stage: one(sp.stage),
    health: one(sp.health),
    platform: one(sp.platform),
    bu: one(sp.bu),
    q: one(sp.q),
  };
  const archived = one(sp.view) === "archived";

  const { items } = await loadPortfolio(ctx.org, { archived });
  const businessUnits = [...new Set(items.map((i) => i.businessUnit).filter((b): b is string => Boolean(b)))].sort();
  const usedPlatforms = new Set(items.flatMap((i) => i.platforms));
  const platformOptions = PLATFORM_OPTIONS.filter((p) => usedPlatforms.has(p.slug));

  const q = filters.q?.toLowerCase();
  const rows = items.filter(
    (i) =>
      (!filters.stage || i.stage === filters.stage) &&
      (!filters.health || i.health === filters.health) &&
      (!filters.platform || i.platforms.includes(filters.platform)) &&
      (!filters.bu || i.businessUnit === filters.bu) &&
      (!q ||
        [i.title, i.problemStatement, i.proposedSolution, i.ownerName, i.sponsor, i.businessUnit, ...i.models, ...i.tags]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(q))),
  );
  const filtered = Object.values(filters).some(Boolean);
  const totalEstimated = rows.reduce((s, i) => s + i.impact.estimatedAnnualUsd, 0);
  const totalActual = rows.reduce((s, i) => s + i.impact.actualRunRateUsd, 0);

  return (
    <>
      <PageHeader
        eyebrow="AI portfolio"
        title={archived ? "Archived initiatives" : "Initiatives"}
        description={archived ? "Archived initiatives are hidden from the dashboard and rankings." : "Ranked by weighted priority score. Pinned initiatives have a manual rank override. Actual / yr is the annualized run-rate from recorded actuals."}
        actions={
          <>
            {ctx.can("export") && !archived ? (
              <ButtonLink href={`${base}/export`} variant="secondary" prefetch={false}>
                <Download className="size-4" /> Export CSV
              </ButtonLink>
            ) : null}
            {ctx.can("initiative:write") && !archived ? (
              <ButtonLink href={`${base}/initiatives/new`}>
                <Plus className="size-4" /> New initiative
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_repeat(4,minmax(0,10rem))_auto]" role="search">
        {archived ? <input type="hidden" name="view" value="archived" /> : null}
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={filters.q} placeholder="Search title, problem, owner, tags…" className="pl-9" />
        </label>
        <Select name="stage" defaultValue={filters.stage ?? ""} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="health" defaultValue={filters.health ?? ""} aria-label="Health">
          <option value="">Any health</option>
          {HEALTH.map((h) => (
            <option key={h.slug} value={h.slug}>
              {h.label}
            </option>
          ))}
        </Select>
        <Select name="platform" defaultValue={filters.platform ?? ""} aria-label="Platform">
          <option value="">All platforms</option>
          {platformOptions.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select name="bu" defaultValue={filters.bu ?? ""} aria-label="Business unit">
          <option value="">All business units</option>
          {businessUnits.map((bu) => (
            <option key={bu} value={bu}>
              {bu}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("secondary")}>
            Filter
          </button>
          {filtered ? (
            <Link href={`${base}/initiatives${archived ? "?view=archived" : ""}`} className={buttonClass("ghost")}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {items.length === 0 && !archived ? (
        <EmptyState
          icon={<ListChecks className="size-8" />}
          title="No initiatives yet"
          description="Add each AI initiative — from early ideas to production systems — to build a single source of truth."
          action={
            ctx.can("initiative:write") ? (
              <ButtonLink href={`${base}/initiatives/new`}>
                <Plus className="size-4" /> New initiative
              </ButtonLink>
            ) : undefined
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState title={archived ? "Nothing archived" : "No initiatives match these filters"} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th className="w-12 text-center">#</Th>
                <Th>Initiative</Th>
                <Th>Stage</Th>
                <Th>Health</Th>
                <Th>Platforms</Th>
                <Th>Score</Th>
                <Th className="text-right whitespace-nowrap">Est. / yr</Th>
                <Th className="text-right whitespace-nowrap">Actual / yr</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={cn("hover:bg-slate-50/70", i.stage === "retired" && "opacity-70")}>
                  <Td className="text-center font-semibold whitespace-nowrap tabular-nums text-slate-500">
                    {i.rank ?? "—"}
                    {i.overridden ? (
                      <span className="ml-0.5 inline-block text-radar-600" title={`Rank pinned to #${i.rankOverride}`}>
                        <Pin className="inline size-3" aria-label="pinned" />
                      </span>
                    ) : null}
                  </Td>
                  <Td className="min-w-56">
                    <Link href={`${base}/initiatives/${i.id}`} className="font-medium text-slate-900 hover:text-radar-700 hover:underline">
                      {i.title}
                    </Link>
                    {i.businessUnit || i.ownerName ? (
                      <div className="mt-0.5 text-xs text-slate-500">{[i.businessUnit, i.ownerName].filter(Boolean).join(" · ")}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <StageBadge stage={i.stage} />
                  </Td>
                  <Td>
                    <HealthBadge health={i.health} />
                  </Td>
                  <Td className="min-w-32">
                    <PlatformList platforms={i.platforms} />
                  </Td>
                  <Td>
                    <ScorePill score={i.score} />
                  </Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">{i.impact.hasEstimate ? formatUsd(i.impact.estimatedAnnualUsd, true) : <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-right tabular-nums whitespace-nowrap">
                    {i.impact.hasActuals ? (
                      <span className="font-medium text-slate-900">{formatUsd(i.impact.actualRunRateUsd, true)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-sm">
                <td colSpan={6} className="px-4 py-2.5 text-slate-500">
                  {rows.length} initiative{rows.length === 1 ? "" : "s"}
                  {filtered ? ` (of ${items.length})` : ""}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatUsd(totalEstimated, true)}</td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatUsd(totalActual, true)}</td>
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}

      <div className="mt-4 text-sm">
        {archived ? (
          <Link href={`${base}/initiatives`} className="font-medium text-radar-700 hover:underline">
            ← Back to active initiatives
          </Link>
        ) : (
          <Link href={`${base}/initiatives?view=archived`} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800">
            <Archive className="size-3.5" /> View archived initiatives
          </Link>
        )}
      </div>
    </>
  );
}
