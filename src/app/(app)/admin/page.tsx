import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { AlertTriangle, ArrowRight, CheckCircle2, Inbox } from "lucide-react";
import { db } from "@/db";
import { contactRequests, ingestionRuns, initiatives, organizations, sources, stories, user, userPreferences } from "@/db/schema";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { listLeads } from "@/lib/leads";
import { formatNumber, timeAgo } from "@/lib/utils";
import { isAdmin, visibleOrgIds } from "./_lib/access";
import { LeadStatusBadge, ScoreBadge } from "./_components/badges";

export const metadata: Metadata = { title: "Overview" };

const DAY = 24 * 60 * 60 * 1000;

export default async function AdminOverviewPage() {
  const me = await requireStaff();
  const now = Date.now();
  const since = (days: number) => new Date(now - days * DAY);
  const orgIds = await visibleOrgIds(me);
  const orgScope = orgIds === null ? undefined : inArray(organizations.id, orgIds.length ? orgIds : [""]);

  const [[signups], [digest], [openRequests], recentRequests, leads, [workspaces], [initiativeCount], [lastRun], [storyCount], [sourceHealth]] =
    await Promise.all([
      db
        .select({
          total: count(),
          last7: sql<number>`count(*) filter (where ${user.createdAt} >= ${since(7).toISOString()}::timestamptz)`.mapWith(Number),
          last30: sql<number>`count(*) filter (where ${user.createdAt} >= ${since(30).toISOString()}::timestamptz)`.mapWith(Number),
          onboarded: sql<number>`count(${user.onboardedAt})`.mapWith(Number),
        })
        .from(user)
        .where(eq(user.platformRole, "user")),
      db
        .select({ subscribers: count() })
        .from(userPreferences)
        .innerJoin(user, eq(user.id, userPreferences.userId))
        .where(and(eq(user.platformRole, "user"), ne(userPreferences.digestFrequency, "off"))),
      db.select({ open: count() }).from(contactRequests).where(isNull(contactRequests.handledAt)),
      db
        .select()
        .from(contactRequests)
        .where(isNull(contactRequests.handledAt))
        .orderBy(desc(contactRequests.createdAt))
        .limit(5),
      listLeads({ sort: "score" }),
      db
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${organizations.status} = 'active')`.mapWith(Number),
        })
        .from(organizations)
        .where(orgScope),
      db
        .select({ total: count() })
        .from(initiatives)
        .innerJoin(organizations, eq(organizations.id, initiatives.orgId))
        .where(and(isNull(initiatives.archivedAt), orgScope)),
      db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(1),
      db.select({ last24: count() }).from(stories).where(gte(stories.createdAt, since(1))),
      db
        .select({
          active: sql<number>`count(*) filter (where ${sources.active})`.mapWith(Number),
          failing: sql<number>`count(*) filter (where ${sources.active} and ${sources.consecutiveFailures} > 0)`.mapWith(Number),
        })
        .from(sources),
    ]);

  const hottest = leads.filter((l) => l.status !== "customer" && l.status !== "disqualified").slice(0, 6);
  const onboardedPct = signups.total ? Math.round((signups.onboarded / signups.total) * 100) : 0;
  const admin = isAdmin(me);
  const runFailed = Boolean(lastRun?.error);
  const runStale = lastRun ? now - lastRun.startedAt.getTime() > 2 * DAY : true;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Good to see you, ${me.name.split(" ")[0]}`}
        description="Lead pipeline, client workspaces and the health of the Radar ingestion pipeline at a glance."
      />

      <section aria-label="Lead funnel" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Signups · 7 days" value={formatNumber(signups.last7)} hint={`${formatNumber(signups.last30)} in the last 30 days`} />
        <Stat label="Total signups" value={formatNumber(signups.total)} hint={`${onboardedPct}% completed onboarding`} />
        <Stat label="Digest subscribers" value={formatNumber(digest.subscribers)} hint="Daily or weekly email" />
        <Stat
          label="Open contact requests"
          value={formatNumber(openRequests.open)}
          hint={
            <Link href="/admin/leads/requests" className="font-medium text-radar-700 hover:underline">
              Review requests →
            </Link>
          }
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Hottest leads"
            description="Highest lead score, excluding customers and disqualified leads."
            action={
              <Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline">
                All leads <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          {hottest.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">No leads yet. Signups from the Radar feed will appear here.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hottest.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/admin/leads/${lead.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                    <ScoreBadge score={lead.score} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{lead.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {[lead.jobTitle, lead.company].filter(Boolean).join(" · ") || lead.email}
                      </div>
                    </div>
                    <div className="hidden text-right text-xs text-slate-500 sm:block">
                      {lead.lastActivityAt ? `Active ${timeAgo(lead.lastActivityAt)}` : null}
                    </div>
                    <LeadStatusBadge status={lead.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Talk to North Labs" description="Unhandled contact requests" />
          {recentRequests.length === 0 ? (
            <CardBody>
              <EmptyState icon={<Inbox className="size-6" />} title="Inbox zero" description="No open contact requests." />
            </CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentRequests.map((r) => (
                <li key={r.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{r.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{timeAgo(r.createdAt)}</span>
                  </div>
                  <div className="truncate text-xs text-slate-500">{[r.company, r.email].filter(Boolean).join(" · ")}</div>
                  {r.message ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{r.message}</p> : null}
                </li>
              ))}
              <li className="px-5 py-3">
                <Link href="/admin/leads/requests" className="text-sm font-medium text-radar-700 hover:underline">
                  View all requests →
                </Link>
              </li>
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={admin ? "Client workspaces" : "Your client workspaces"}
            action={
              <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline">
                Workspaces <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          <CardBody className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Active workspaces</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatNumber(workspaces.active)}</div>
              <div className="text-xs text-slate-500">{formatNumber(workspaces.total - workspaces.active)} suspended</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Initiatives tracked</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{formatNumber(initiativeCount.total)}</div>
              <div className="text-xs text-slate-500">Across {admin ? "all clients" : "your clients"}</div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Ingestion pipeline"
            action={
              admin ? (
                <Link href="/admin/sources" className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline">
                  Sources <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : null
            }
          />
          <CardBody className="space-y-3">
            <div className="flex items-start gap-3">
              {runFailed || runStale ? (
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-radar-600" aria-hidden />
              )}
              <div className="min-w-0 text-sm">
                {lastRun ? (
                  <>
                    <div className="font-medium text-slate-900">
                      Last run {timeAgo(lastRun.startedAt)} <span className="font-normal text-slate-500">({lastRun.trigger})</span>
                    </div>
                    <div className="text-slate-500">
                      {lastRun.error
                        ? `Failed: ${lastRun.error}`
                        : lastRun.finishedAt
                          ? `${formatNumber(lastRun.stats?.articlesAdded ?? 0)} articles added · ${formatNumber(lastRun.stats?.storiesCreated ?? 0)} stories created`
                          : "Still running…"}
                    </div>
                  </>
                ) : (
                  <div className="font-medium text-slate-900">The pipeline has never run.</div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{formatNumber(storyCount.last24)} new stories in 24h</Badge>
              <Badge tone="neutral">{formatNumber(sourceHealth.active)} active sources</Badge>
              <Badge tone={sourceHealth.failing > 0 ? "amber" : "radar"}>
                {formatNumber(sourceHealth.failing)} failing {sourceHealth.failing === 1 ? "source" : "sources"}
              </Badge>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
