import { ArrowRight, BellRing, Download, Plus, Rocket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { STAGES, categoryLabel } from "@/lib/taxonomy";
import { cn, formatNumber, formatUsd, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { ActivityFeed } from "./_components/activity-feed";
import { AccessBadge, HealthBadge, STAGE_BAR, ScorePill, StageBadge } from "./_components/badges";
import { loadActivity } from "./_lib/activity";
import { loadOpenAlerts } from "./_lib/alerts";
import { loadOrgDependencies, systemUsage } from "./_lib/dependencies";
import { formatPct } from "./_lib/format";
import { loadPortfolio } from "./_lib/portfolio";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;

  const [portfolio, deps, alerts, activity] = await Promise.all([
    loadPortfolio(ctx.org),
    loadOrgDependencies(ctx.org.id),
    loadOpenAlerts(ctx.org.id, { limit: 4 }),
    loadActivity(ctx.org.id, { limit: 8 }),
  ]);
  const { items, totals, roiActual, roiEstimated } = portfolio;

  const actions = (
    <>
      {ctx.can("export") && items.length > 0 ? (
        <ButtonLink href={`${base}/export`} variant="secondary" prefetch={false}>
          <Download className="size-4" /> Export CSV
        </ButtonLink>
      ) : null}
      {ctx.can("initiative:write") ? (
        <ButtonLink href={`${base}/initiatives/new`}>
          <Plus className="size-4" /> New initiative
        </ButtonLink>
      ) : null}
    </>
  );

  if (items.length === 0) {
    return (
      <>
        <PageHeader eyebrow="AI portfolio" title="Dashboard" actions={actions} />
        <EmptyState
          icon={<Rocket className="size-8" />}
          title="No initiatives yet"
          description="Track every AI initiative in one place — what problem it solves, where it is, what data it needs and the value it delivers."
          action={
            ctx.can("initiative:write") ? (
              <ButtonLink href={`${base}/initiatives/new`}>
                <Plus className="size-4" /> Add the first initiative
              </ButtonLink>
            ) : undefined
          }
        />
      </>
    );
  }

  const active = items.filter((i) => i.stage !== "retired");
  const inProduction = active.filter((i) => i.stage === "production").length;
  const inPilot = active.filter((i) => i.stage === "pilot").length;
  const needsAttention = active.filter((i) => i.health !== "on_track").length;
  const realization = totals.estimatedAnnualUsd > 0 ? totals.actualRunRateUsd / totals.estimatedAnnualUsd : null;

  // Pipeline: counts per stage split by health.
  const pipeline = STAGES.map((s) => {
    const inStage = items.filter((i) => i.stage === s.slug);
    return {
      ...s,
      total: inStage.length,
      on_track: inStage.filter((i) => i.health === "on_track").length,
      at_risk: inStage.filter((i) => i.health === "at_risk").length,
      blocked: inStage.filter((i) => i.health === "blocked").length,
      value: inStage.reduce((sum, i) => sum + i.impact.estimatedAnnualUsd, 0),
    };
  });
  const maxStage = Math.max(1, ...pipeline.map((p) => p.total));

  const top = active.filter((i) => i.rank != null).slice(0, 6);

  const impactRows = active
    .filter((i) => i.impact.hasEstimate || i.impact.hasActuals)
    .sort((a, b) => Math.max(b.impact.estimatedAnnualUsd, b.impact.actualRunRateUsd) - Math.max(a.impact.estimatedAnnualUsd, a.impact.actualRunRateUsd))
    .slice(0, 8);
  const maxImpact = Math.max(1, ...impactRows.flatMap((i) => [i.impact.estimatedAnnualUsd, i.impact.actualRunRateUsd]));

  const usage = [...systemUsage(deps).values()].sort((a, b) => b.initiativeCount - a.initiativeCount || a.systemName.localeCompare(b.systemName));
  const hotspots = usage.slice(0, 6);
  const maxUsage = Math.max(1, ...hotspots.map((h) => h.initiativeCount));
  const accessIssues = deps
    .filter((d) => d.accessStatus === "blocked" || d.accessStatus === "requested")
    .sort((a, b) => (a.accessStatus === b.accessStatus ? 0 : a.accessStatus === "blocked" ? -1 : 1))
    .slice(0, 6);

  return (
    <>
      <PageHeader
        eyebrow="AI portfolio"
        title="Dashboard"
        description={`Every AI initiative across ${ctx.org.name}, regardless of platform — status, value and data readiness at a glance.`}
        actions={actions}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active initiatives"
          value={active.length}
          hint={
            <>
              {inProduction} in production · {inPilot} in pilot
              {needsAttention ? <span className="text-amber-700"> · {needsAttention} need attention</span> : null}
            </>
          }
        />
        <Stat
          label="Value delivered (annualized)"
          value={formatUsd(totals.actualRunRateUsd, true)}
          hint={
            <>
              vs {formatUsd(totals.estimatedAnnualUsd, true)} estimated
              {realization != null ? ` · ${formatPct(realization)} realized` : ""}
              <br />
              {formatUsd(totals.actualTrailing12Usd, true)} realized in the last 12 months
            </>
          }
        />
        <Stat
          label="Hours saved / year"
          value={formatNumber(totals.actualRunRateHours, true)}
          hint={`Run-rate from actuals · ${formatNumber(totals.estimatedAnnualHours, true)} estimated`}
        />
        <Stat
          label="First-year ROI"
          value={roiActual.roi != null ? formatPct(roiActual.roi) : roiEstimated.roi != null ? formatPct(roiEstimated.roi) : "—"}
          hint={
            roiActual.roi != null
              ? `On actuals across ${roiActual.count} initiative${roiActual.count === 1 ? "" : "s"} with cost data${roiEstimated.roi != null ? ` · ${formatPct(roiEstimated.roi)} projected portfolio-wide` : ""}`
              : roiEstimated.roi != null
                ? `Projected from estimates across ${roiEstimated.count} initiatives with cost data`
                : "Add build and run costs to initiatives to see ROI"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Pipeline by stage" description="Initiative count per stage, split by health" />
          <CardBody className="space-y-3">
            {pipeline.map((p) => (
              <Link
                key={p.slug}
                href={`${base}/initiatives?stage=${p.slug}`}
                className="group grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 rounded-md text-sm"
              >
                <span className="flex items-center gap-2 text-slate-700 group-hover:text-slate-900">
                  <span className={cn("size-2 rounded-sm", STAGE_BAR[p.slug])} aria-hidden />
                  {p.label}
                </span>
                <span className="flex h-6 overflow-hidden rounded-md bg-slate-50 ring-1 ring-inset ring-slate-100" aria-hidden>
                  {p.total > 0 ? (
                    <span className="flex h-full" style={{ width: `${(p.total / maxStage) * 100}%` }}>
                      <span className="h-full bg-radar-500" style={{ flexGrow: p.on_track }} />
                      <span className="h-full bg-amber-400" style={{ flexGrow: p.at_risk }} />
                      <span className="h-full bg-red-500" style={{ flexGrow: p.blocked }} />
                    </span>
                  ) : null}
                </span>
                <span className="w-24 text-right tabular-nums text-slate-900">
                  <span className="font-semibold">{p.total}</span>
                  {p.value > 0 ? <span className="ml-1.5 text-xs text-slate-500">{formatUsd(p.value, true)}</span> : null}
                </span>
              </Link>
            ))}
            <div className="flex flex-wrap gap-4 pt-1 text-xs text-slate-500">
              <Legend className="bg-radar-500">On track</Legend>
              <Legend className="bg-amber-400">At risk</Legend>
              <Legend className="bg-red-500">Blocked</Legend>
              <span className="ml-auto">$ = estimated annual value</span>
            </div>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Top priorities"
            description="Ranked by weighted priority score"
            action={
              <Link href={`${base}/initiatives`} className="text-sm font-medium text-radar-700 hover:underline">
                All
              </Link>
            }
          />
          <ol className="divide-y divide-slate-100">
            {top.map((i) => (
              <li key={i.id}>
                <Link href={`${base}/initiatives/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-slate-400" title={i.overridden ? "Rank set manually" : undefined}>
                    {i.rank}
                    {i.overridden ? <span className="text-radar-600">*</span> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{i.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StageBadge stage={i.stage} />
                      {i.health !== "on_track" ? <HealthBadge health={i.health} /> : null}
                    </span>
                  </span>
                  <ScorePill score={i.score} />
                </Link>
              </li>
            ))}
          </ol>
          {top.some((i) => i.overridden) ? <p className="px-5 pb-3 text-xs text-slate-500">* rank set manually</p> : null}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader title="Impact by initiative" description="Annualized value: estimate vs. actual run-rate" />
          <CardBody>
            {impactRows.length === 0 ? (
              <p className="text-sm text-slate-500">No impact metrics yet. Add estimated value on an initiative to see it here.</p>
            ) : (
              <ul className="space-y-4">
                {impactRows.map((i) => (
                  <li key={i.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link href={`${base}/initiatives/${i.id}`} className="truncate font-medium text-slate-900 hover:text-radar-700 hover:underline">
                        {i.title}
                      </Link>
                      <span className="shrink-0 tabular-nums text-slate-500">
                        <span className="font-semibold text-slate-900">{i.impact.hasActuals ? formatUsd(i.impact.actualRunRateUsd, true) : "—"}</span> / {formatUsd(i.impact.estimatedAnnualUsd, true)}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-1" aria-hidden>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-slate-300" style={{ width: `${(i.impact.estimatedAnnualUsd / maxImpact) * 100}%` }} />
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-radar-500" style={{ width: `${(i.impact.actualRunRateUsd / maxImpact) * 100}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex gap-4 text-xs text-slate-500">
              <Legend className="bg-slate-300">Estimated</Legend>
              <Legend className="bg-radar-500">Actual (annualized run-rate)</Legend>
            </div>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="Data dependency hotspots"
            description="Systems of record the portfolio relies on most"
            action={
              <Link href={`${base}/systems`} className="text-sm font-medium text-radar-700 hover:underline">
                Systems
              </Link>
            }
          />
          <CardBody className="space-y-5">
            {hotspots.length === 0 ? (
              <p className="text-sm text-slate-500">No data dependencies recorded yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {hotspots.map((h) => (
                  <li key={h.systemId} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
                    <Link href={`${base}/systems/${h.systemId}`} className="truncate font-medium text-slate-800 hover:text-radar-700 hover:underline">
                      {h.systemName}
                    </Link>
                    <span className="h-2 rounded-full bg-slate-100" aria-hidden>
                      <span className="block h-2 rounded-full bg-ink-700" style={{ width: `${(h.initiativeCount / maxUsage) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-slate-900">{h.initiativeCount}</span>
                  </li>
                ))}
              </ul>
            )}
            {accessIssues.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Access blockers & pending requests</h3>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {accessIssues.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">{d.systemName}</div>
                        <Link href={`${base}/initiatives/${d.initiativeId}`} className="block truncate text-xs text-slate-500 hover:text-radar-700 hover:underline">
                          {d.initiativeTitle}
                        </Link>
                      </div>
                      <AccessBadge status={d.accessStatus} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Recent Radar alerts"
            description="Market news that affects platforms your initiatives run on"
            action={
              <Link href={`${base}/alerts`} className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline">
                All alerts <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {alerts.length === 0 ? (
            <CardBody>
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <BellRing className="size-4" /> No open alerts. We’ll flag pricing changes, deprecations and security news for your platforms here.
              </p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((a) => (
                <li key={a.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    {a.storyCategories.slice(0, 2).map((c) => (
                      <span key={c} className="font-medium text-amber-700">
                        {categoryLabel(c)}
                      </span>
                    ))}
                    <span>· {timeAgo(a.storyPublishedAt)}</span>
                  </div>
                  <Link href={`/radar/${a.storySlug}`} className="mt-0.5 block text-sm font-medium text-slate-900 hover:text-radar-700 hover:underline">
                    {a.storyTitle}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Affects{" "}
                    <Link href={`${base}/initiatives/${a.initiativeId}`} className="font-medium text-slate-700 hover:underline">
                      {a.initiativeTitle}
                    </Link>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Recent activity" />
          <CardBody>
            <ActivityFeed rows={activity} slug={ctx.org.slug} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Legend({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-sm", className)} aria-hidden />
      {children}
    </span>
  );
}
