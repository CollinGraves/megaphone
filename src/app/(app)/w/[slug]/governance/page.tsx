import { AlertTriangle, ArrowRight, Download, Search, ShieldCheck, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Select, Table, Td, Th, buttonClass } from "@/components/ui";
import { PENDING_STALE_DAYS, daysBetween, isoDate } from "@/lib/governance";
import { APPROVAL_STATUSES, HUMAN_OVERSIGHT_LEVELS, RISK_TIERS, SENSITIVITIES, STAGES, labelFrom } from "@/lib/taxonomy";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { SensitivityBadge, StageBadge, platformLabel } from "../_components/badges";
import { filterQuery, filterRegister, loadRegister, parseRegisterFilters, summarizeRegister } from "./data";
import { ApprovalBadge, GovernanceDisclaimer, OversightText, ReviewDue, RiskTierBadge, TIER_BAR } from "./governance-ui";

export const metadata: Metadata = { title: "AI use-case register" };

const ISSUE_FILTER_LABELS: Record<string, string> = {
  prohibited_active: "Prohibited but active",
  unapproved_in_gated_stage: "Missing required approval",
  rejected_but_live: "Live but not approved",
  high_risk_no_oversight: "High risk without oversight",
  unclassified_live: "Unclassified in pilot / production",
  review_overdue: "Review overdue",
  pending_stale: "Review pending too long",
  under_classified: "Tier below suggestion",
};

export default async function GovernancePage({ params, searchParams }: PageProps<"/w/[slug]/governance">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;
  const canApprove = ctx.can("governance:approve");

  const { items, policy, today } = await loadRegister(ctx.org);
  const filters = parseRegisterFilters(sp);
  const rows = filterRegister(items, filters);
  const filtered = Object.values(filters).some(Boolean);
  const summary = summarizeRegister(items);
  const href = (f: Partial<typeof filters>) => `${base}/governance${filterQuery(f)}`;

  const attention = items
    .filter((i) => i.issues.length > 0)
    .sort((a, b) => b.issues.filter((x) => x.severity === "high").length - a.issues.filter((x) => x.severity === "high").length || b.issues.length - a.issues.length);
  const queue = items
    .filter((i) => i.approvalStatus === "pending")
    .sort((a, b) => (a.approvalRequestedAt?.getTime() ?? 0) - (b.approvalRequestedAt?.getTime() ?? 0));
  const staleCount = queue.filter((i) => i.approvalRequestedAt && daysBetween(isoDate(i.approvalRequestedAt), today) > PENDING_STALE_DAYS).length;
  const gated = policy.approvalRequiredStages.map((s) => labelFrom(STAGES, s));

  const header = (
    <PageHeader
      eyebrow="AI governance"
      title="AI use-case register"
      description={`Every AI use case across ${ctx.org.name}, whatever platform it runs on — risk tier, human oversight, data sensitivity and approval in one inventory.`}
      actions={
        ctx.can("export") && items.length > 0 ? (
          <ButtonLink href={`${base}/governance/export${filterQuery(filters)}`} variant="secondary" prefetch={false}>
            <Download className="size-4" /> Export inventory{filtered ? " (filtered)" : ""}
          </ButtonLink>
        ) : null
      }
    />
  );

  if (items.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={<ShieldCheck className="size-8" />}
          title="No AI use cases yet"
          description="Each initiative you add becomes an entry in this register, ready to classify, review and approve."
          action={
            ctx.can("initiative:write") ? (
              <ButtonLink href={`${base}/initiatives/new`}>Add an initiative</ButtonLink>
            ) : undefined
          }
        />
      </>
    );
  }

  const tierTotal = Math.max(1, summary.total);

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatLink
          href={href({ status: "pending" })}
          label="Pending reviews"
          value={summary.pending}
          tone={summary.pending ? "amber" : undefined}
          hint={staleCount ? `${staleCount} waiting more than ${PENDING_STALE_DAYS} days` : "Awaiting an owner or admin"}
        />
        <StatLink
          href={href({ issue: "review_overdue" })}
          label="Overdue reviews"
          value={summary.overdue}
          tone={summary.overdue ? "red" : undefined}
          hint={summary.dueSoon ? `${summary.dueSoon} more due in the next 30 days` : `Approvals re-reviewed every ${policy.reviewIntervalMonths} months`}
        />
        <StatLink
          href={href({ issue: "unclassified_live" })}
          label="Unclassified in pilot / production"
          value={summary.unclassifiedLive}
          tone={summary.unclassifiedLive ? "amber" : undefined}
          hint={`${summary.byTier.unclassified ?? 0} unclassified overall`}
        />
        <StatLink
          href={href({ issue: "high_risk_no_oversight" })}
          label="High risk without oversight"
          value={summary.highNoOversight}
          tone={summary.highNoOversight ? "red" : undefined}
          hint={`${summary.byTier.high ?? 0} high-risk use case${summary.byTier.high === 1 ? "" : "s"} in total`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5 [&>*]:min-w-0">
        <Card className="xl:col-span-3">
          <CardHeader
            title="Needs attention"
            description={attention.length ? `${attention.length} use case${attention.length === 1 ? "" : "s"} with open governance issues` : "No open governance issues"}
            action={
              attention.length ? (
                <Link href={href({ attention: true })} className="text-sm font-medium text-radar-700 hover:underline">
                  Filter
                </Link>
              ) : undefined
            }
          />
          {attention.length === 0 ? (
            <CardBody>
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <ShieldCheck className="size-4 text-radar-600" /> Everything live is classified, overseen and approved where policy requires it.
              </p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.slice(0, 8).map((i) => (
                <li key={i.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`${base}/initiatives/${i.id}#governance`} className="text-sm font-medium text-slate-900 hover:text-radar-700 hover:underline">
                      {i.title}
                    </Link>
                    <StageBadge stage={i.stage} />
                    <RiskTierBadge tier={i.riskTier} />
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {i.issues.map((x) => (
                      <li key={x.code} className={cn("flex items-start gap-1.5 text-xs", x.severity === "high" ? "text-red-700" : "text-amber-800")}>
                        <AlertTriangle className="mt-px size-3.5 shrink-0" />
                        {x.label}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
          {attention.length > 8 ? (
            <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
              + {attention.length - 8} more —{" "}
              <Link href={href({ attention: true })} className="font-medium text-radar-700 hover:underline">
                see all
              </Link>
            </p>
          ) : null}
        </Card>

        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Risk tiers" description="Active use cases by tier (excludes retired)" />
            <CardBody className="space-y-3">
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                {RISK_TIERS.map((t) =>
                  summary.byTier[t.slug] ? (
                    <span key={t.slug} className={cn("h-full", TIER_BAR[t.slug])} style={{ width: `${(summary.byTier[t.slug] / tierTotal) * 100}%` }} />
                  ) : null,
                )}
              </div>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {RISK_TIERS.map((t) => (
                  <li key={t.slug}>
                    <Link href={href({ tier: t.slug })} className="flex items-center gap-2 rounded text-slate-700 hover:text-slate-900">
                      <span className={cn("size-2 shrink-0 rounded-sm", TIER_BAR[t.slug])} aria-hidden />
                      <span className="truncate">{t.label}</span>
                      <span className="ml-auto font-semibold tabular-nums text-slate-900">{summary.byTier[t.slug] ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {canApprove ? (
            <Card>
              <CardHeader title="Approvals queue" description={queue.length ? "Oldest request first" : "Nothing waiting for your review"} />
              {queue.length ? (
                <ul className="divide-y divide-slate-100">
                  {queue.map((i) => (
                    <li key={i.id}>
                      <Link href={`${base}/initiatives/${i.id}#governance`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">{i.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <RiskTierBadge tier={i.riskTier} />
                            <span>
                              {i.requestedByName ?? "Someone"} · {i.approvalRequestedAt ? timeAgo(i.approvalRequestedAt) : "—"}
                            </span>
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-radar-700">
                          Review <ArrowRight className="size-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <CardBody>
                  <p className="text-sm text-slate-500">When an editor requests a review it shows up here and you’ll get an email.</p>
                </CardBody>
              )}
            </Card>
          ) : (
            <Card>
              <CardHeader title="Workspace policy" />
              <CardBody className="space-y-1.5 text-sm text-slate-700">
                <p>{gated.length ? `Approval required before ${gated.join(" and ")}.` : "No stage requires approval yet."}</p>
                <p>Approvals are re-reviewed every {policy.reviewIntervalMonths} months.</p>
                <p className="text-slate-500">
                  {summary.pending} review{summary.pending === 1 ? "" : "s"} pending with owners and admins.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold text-slate-900">Register</h2>
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(12rem,1.3fr)_repeat(5,minmax(0,1fr))]" role="search">
        {filters.issue ? <input type="hidden" name="issue" value={filters.issue} /> : null}
        <label className="relative sm:col-span-2 lg:col-span-4 xl:col-span-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={filters.q} placeholder="Search use case, owner, model…" className="pl-9" />
        </label>
        <Select name="tier" defaultValue={filters.tier ?? ""} aria-label="Risk tier">
          <option value="">All tiers</option>
          {RISK_TIERS.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Approval status">
          <option value="">Any approval</option>
          {APPROVAL_STATUSES.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="oversight" defaultValue={filters.oversight ?? ""} aria-label="Human oversight">
          <option value="">Any oversight</option>
          {HUMAN_OVERSIGHT_LEVELS.map((o) => (
            <option key={o.slug} value={o.slug}>
              {o.label}
            </option>
          ))}
          <option value="unset">Not recorded</option>
        </Select>
        <Select name="stage" defaultValue={filters.stage ?? ""} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="data" defaultValue={filters.data ?? ""} aria-label="Most sensitive data">
          <option value="">Any data</option>
          {SENSITIVITIES.map((s) => (
            <option key={s.slug} value={s.slug}>
              Up to {s.label}
            </option>
          ))}
          <option value="none">No data dependencies</option>
        </Select>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-4 xl:col-span-6">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="attention" value="1" defaultChecked={filters.attention} className="size-4 rounded border-slate-300 accent-radar-600" />
            Needs attention only
          </label>
          {filters.issue ? (
            <Link href={href({ ...filters, issue: undefined })} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 ring-inset hover:bg-amber-100">
              {ISSUE_FILTER_LABELS[filters.issue] ?? filters.issue} <X className="size-3" aria-label="Remove filter" />
            </Link>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("secondary", "sm")}>
              Filter
            </button>
            {filtered ? (
              <Link href={`${base}/governance`} className={buttonClass("ghost", "sm")}>
                Clear
              </Link>
            ) : null}
          </div>
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No use cases match these filters" />
      ) : (
        <Card className="overflow-hidden">
          <Table className="[&_td]:px-3 [&_th]:px-3">
            <thead>
              <tr>
                <Th>Use case</Th>
                <Th>Risk tier</Th>
                <Th>Oversight</Th>
                <Th className="whitespace-nowrap">Data</Th>
                <Th>Platforms / models</Th>
                <Th>Approval</Th>
                <Th className="whitespace-nowrap">Review due</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className={cn("hover:bg-slate-50/70", i.stage === "retired" && "opacity-70")}>
                  <Td className="min-w-52">
                    <Link href={`${base}/initiatives/${i.id}#governance`} className="font-medium text-slate-900 hover:text-radar-700 hover:underline">
                      {i.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <StageBadge stage={i.stage} />
                      {i.businessUnit || i.ownerName ? <span>{[i.businessUnit, i.ownerName].filter(Boolean).join(" · ")}</span> : null}
                    </div>
                    {i.issues.length ? (
                      <div
                        className={cn("mt-1 flex items-start gap-1 text-xs", i.issues[0].severity === "high" ? "text-red-700" : "text-amber-800")}
                        title={i.issues.map((x) => x.label).join("\n")}
                      >
                        <AlertTriangle className="mt-px size-3.5 shrink-0" />
                        <span>
                          {i.issues[0].label}
                          {i.issues.length > 1 ? ` (+${i.issues.length - 1})` : ""}
                        </span>
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <RiskTierBadge tier={i.riskTier} />
                    {i.suggestion.tier !== "unclassified" && i.suggestion.tier !== i.riskTier && i.riskTier !== "prohibited" ? (
                      <div className="mt-1 text-xs whitespace-nowrap text-violet-700" title={i.suggestion.explanation}>
                        Suggested: {labelFrom(RISK_TIERS, i.suggestion.tier)}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="min-w-24 text-sm">
                    <OversightText level={i.humanOversight} />
                  </Td>
                  <Td>{i.maxSensitivity ? <SensitivityBadge sensitivity={i.maxSensitivity} /> : <span className="text-slate-400">—</span>}</Td>
                  <Td className="min-w-28 text-sm">
                    {i.platforms.length ? <div className="text-slate-800">{i.platforms.map(platformLabel).join(", ")}</div> : <span className="text-slate-400">—</span>}
                    {i.models.length ? <div className="mt-0.5 text-xs text-slate-500">{i.models.join(", ")}</div> : null}
                  </Td>
                  <Td>
                    <ApprovalBadge status={i.approvalStatus} />
                    {i.approvalStatus === "pending" && i.approvalRequestedAt ? (
                      <div className="mt-1 text-xs whitespace-nowrap text-slate-500">since {formatDate(i.approvalRequestedAt)}</div>
                    ) : (i.approvalStatus === "approved" || i.approvalStatus === "conditional" || i.approvalStatus === "rejected") && i.approvalDecidedAt ? (
                      <div className="mt-1 text-xs text-slate-500">
                        <span className="whitespace-nowrap">{formatDate(i.approvalDecidedAt)}</span>
                        {i.decidedByName ? <span className="block">{i.decidedByName}</span> : null}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <ReviewDue due={i.reviewDueOn} state={i.review} />
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 text-sm">
                <td colSpan={7} className="px-4 py-2.5 text-slate-500">
                  {rows.length} use case{rows.length === 1 ? "" : "s"}
                  {filtered ? ` (of ${items.length})` : ""}
                </td>
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}

      <GovernanceDisclaimer className="mt-4 max-w-3xl" />
    </>
  );
}

function StatLink({ href, label, value, hint, tone }: { href: string; label: string; value: number; hint: ReactNode; tone?: "amber" | "red" }) {
  return (
    <Link href={href} className="group block min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-xs transition-colors hover:border-slate-300 sm:px-5 sm:py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums",
          value > 0 && tone === "red" ? "text-red-700" : value > 0 && tone === "amber" ? "text-amber-700" : "text-slate-900",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </Link>
  );
}
