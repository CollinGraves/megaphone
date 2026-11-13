import { and, desc, eq } from "drizzle-orm";
import { Lightbulb, Link2, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { ideas } from "@/db/schema";
import { estimateAnnualHours, ideaSignal, urgencyRank } from "@/lib/ideas";
import { IDEA_STATUSES } from "@/lib/taxonomy";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { CopyButton } from "../_components/client";
import { ChannelLabel, IdeaStatusBadge, SignalMeter, UrgencyBadge } from "./_components/badges";
import { intakeUrl } from "./_lib/server";

export const metadata: Metadata = { title: "Ideas" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const TABS = [
  { slug: "open", label: "Open", statuses: ["new", "under_review"] },
  ...IDEA_STATUSES.map((s) => ({ slug: s.slug as string, label: s.label, statuses: [s.slug as string] })),
  { slug: "all", label: "All", statuses: null },
] as const satisfies readonly { slug: string; label: string; statuses: readonly string[] | null }[];

const SORTS = [
  { slug: "newest", label: "Newest first" },
  { slug: "oldest", label: "Oldest first" },
  { slug: "hours", label: "Most hours / yr" },
  { slug: "urgency", label: "Most urgent" },
  { slug: "signal", label: "Strongest signal" },
] as const;

export default async function IdeasPage({ params, searchParams }: PageProps<"/w/[slug]/ideas">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;
  const canTriage = ctx.can("ideas:triage");
  const canSubmit = ctx.can("ideas:submit");

  // Triagers see every idea; everyone else only sees what they submitted.
  const all = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.orgId, ctx.org.id), canTriage ? undefined : eq(ideas.submittedById, ctx.user.id)))
    .orderBy(desc(ideas.createdAt))
    .limit(2000);

  const tabSlug = one(sp.status);
  const tab = TABS.find((t) => t.slug === tabSlug) ?? (canTriage ? TABS[0] : TABS[TABS.length - 1]);
  const sort = SORTS.find((s) => s.slug === one(sp.sort))?.slug ?? "newest";
  const q = one(sp.q)?.toLowerCase();

  const enriched = all.map((i) => ({ ...i, annualHours: estimateAnnualHours(i), signal: ideaSignal(i) }));
  const inTab = (statuses: readonly string[] | null) => enriched.filter((i) => !statuses || statuses.includes(i.status));
  const rows = inTab(tab.statuses)
    .filter(
      (i) =>
        !q ||
        [i.title, i.problem, i.desiredOutcome, i.department, i.submitterName, i.submitterEmail, i.systemsInvolved]
          .filter(Boolean)
          .some((t) => t!.toLowerCase().includes(q)),
    )
    .sort((a, b) => {
      const newest = b.createdAt.getTime() - a.createdAt.getTime();
      switch (sort) {
        case "oldest":
          return -newest;
        case "hours":
          return (b.annualHours ?? -1) - (a.annualHours ?? -1) || newest;
        case "urgency":
          return urgencyRank(b.urgency) - urgencyRank(a.urgency) || newest;
        case "signal":
          return b.signal.points - a.signal.points || (b.annualHours ?? -1) - (a.annualHours ?? -1) || newest;
        default:
          return newest;
      }
    });

  const tabHref = (slug: string) => {
    const qs = new URLSearchParams();
    qs.set("status", slug);
    if (q) qs.set("q", one(sp.q)!);
    if (sort !== "newest") qs.set("sort", sort);
    return `${base}/ideas?${qs.toString()}`;
  };
  const visibleTabs = canTriage ? TABS : TABS.filter((t) => t.slug === "all" || t.slug === "open" || inTab(t.statuses).length > 0);

  return (
    <>
      <PageHeader
        eyebrow="Idea intake"
        title={canTriage ? "Ideas" : "My ideas"}
        description={
          canTriage
            ? "AI ideas from across the company. Review them, convert the promising ones into initiatives, and let submitters know what happened."
            : `Ideas you’ve submitted to ${ctx.org.name}’s AI team, and where they stand.`
        }
        actions={
          canSubmit ? (
            <ButtonLink href={`${base}/ideas/new`} variant={canTriage ? "secondary" : "primary"}>
              <Plus className="size-4" /> Submit an idea
            </ButtonLink>
          ) : null
        }
      />

      {canTriage ? <IntakeCallout token={ctx.org.intakeToken} orgName={ctx.org.name} settingsHref={ctx.can("settings:manage") ? `${base}/settings#intake` : null} /> : null}

      {all.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="size-8" />}
          title={canTriage ? "No ideas yet" : "You haven’t submitted any ideas yet"}
          description={
            canTriage
              ? "Ideas submitted by colleagues — in the workspace or through the intake link — land here for triage."
              : "Spotted a repetitive task, a slow process or a question AI could answer? Share it with the AI team."
          }
          action={
            canSubmit ? (
              <ButtonLink href={`${base}/ideas/new`}>
                <Plus className="size-4" /> Submit an idea
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <nav aria-label="Idea status" className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {visibleTabs.map((t) => {
              const n = inTab(t.statuses).length;
              const active = t.slug === tab.slug;
              return (
                <Link
                  key={t.slug}
                  href={tabHref(t.slug)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-ink-900 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900",
                  )}
                >
                  {t.label}
                  <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", active ? "bg-white/15 text-white" : "bg-slate-200/70 text-slate-600")}>{n}</span>
                </Link>
              );
            })}
          </nav>

          <form method="get" className="mb-4 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_12rem_auto]" role="search">
            <input type="hidden" name="status" value={tab.slug} />
            <label className="relative">
              <span className="sr-only">Search ideas</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={one(sp.q)} placeholder={canTriage ? "Search title, problem, submitter, department…" : "Search your ideas…"} className="pl-9" />
            </label>
            <Select name="sort" defaultValue={sort} aria-label="Sort">
              {SORTS.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
            </Select>
            <div className="flex gap-2">
              <button type="submit" className={buttonClass("secondary")}>
                Apply
              </button>
              {q || sort !== "newest" ? (
                <Link href={`${base}/ideas?status=${tab.slug}`} className={buttonClass("ghost")}>
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          {rows.length === 0 ? (
            <EmptyState title={q ? "No ideas match your search" : `No ${tab.slug === "all" ? "" : `${tab.label.toLowerCase()} `}ideas`} />
          ) : (
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1fr)_6.5rem_7rem_7.5rem] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                <span>Idea</span>
                <span className="text-right">Hours / yr</span>
                <span>Urgency</span>
                <span>Status</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {rows.map((i) => (
                  <li key={i.id} className="relative grid gap-2 px-5 py-3.5 hover:bg-slate-50/70 md:grid-cols-[minmax(0,1fr)_6.5rem_7rem_7.5rem] md:items-start md:gap-4">
                    <div className="min-w-0">
                      <Link href={`${base}/ideas/${i.id}`} className="font-medium text-slate-900 after:absolute after:inset-0 hover:text-radar-700 hover:underline">
                        {i.title}
                      </Link>
                      <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{i.problem}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                        {canTriage ? <span className="font-medium text-slate-700">{i.submitterName}</span> : null}
                        {i.department ? <span>{canTriage ? "· " : ""}{i.department}</span> : null}
                        <span>·</span>
                        <ChannelLabel channel={i.channel} />
                        <span>·</span>
                        <time dateTime={i.createdAt.toISOString()} title={i.createdAt.toLocaleString("en-US")}>
                          {timeAgo(i.createdAt)}
                        </time>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 md:contents">
                      <div className="flex items-center gap-2 text-sm tabular-nums md:justify-end md:pt-0.5">
                        <SignalMeter idea={i} />
                        {i.annualHours != null ? (
                          <span className="font-medium text-slate-900">
                            {formatNumber(i.annualHours, true)}
                            <span className="ml-0.5 text-xs font-normal text-slate-500 md:hidden"> h/yr</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                      <div className="md:pt-0.5">
                        <UrgencyBadge urgency={i.urgency} />
                      </div>
                      <div className="md:pt-0.5">
                        <IdeaStatusBadge status={i.status} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="border-t border-slate-200 bg-slate-50 px-5 py-2.5 text-sm text-slate-500">
                {rows.length} idea{rows.length === 1 ? "" : "s"}
                {rows.length !== all.length ? ` (of ${all.length})` : ""}
                {canTriage ? " · Hours / yr = time spent on the task today (hours per week × people × 52)." : ""}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}

function IntakeCallout({ token, orgName, settingsHref }: { token: string | null; orgName: string; settingsHref: string | null }) {
  if (!token && !settingsHref) return null;
  return (
    <Card className="mb-5 flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-radar-50 text-radar-700 ring-1 ring-radar-200">
          <Link2 className="size-4" />
        </span>
        <div className="min-w-0 text-sm">
          <div className="font-medium text-slate-900">{token ? "Intake link is on" : "Collect ideas from everyone"}</div>
          <p className="text-slate-500">
            {token
              ? `Anyone at ${orgName} can submit an idea with their work email — no account needed.`
              : `Turn on the shareable intake link so anyone at ${orgName} can submit ideas without an account.`}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
        {token ? <CopyButton value={intakeUrl(token)} label="Copy intake link" /> : null}
        {settingsHref ? (
          <Link href={settingsHref} className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline">
            {token ? "Manage" : "Set up in settings"}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
