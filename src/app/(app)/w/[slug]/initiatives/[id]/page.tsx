import { and, asc, desc, eq } from "drizzle-orm";
import { Archive, ArchiveRestore, ChevronLeft, Pencil, Pin, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, Textarea } from "@/components/ui";
import { db } from "@/db";
import { comments, dataDependencies, initiatives, systems, user } from "@/db/schema";
import { firstYearCost } from "@/lib/impact";
import { scoreBreakdown } from "@/lib/scoring";
import { BUILD_APPROACHES, labelFrom } from "@/lib/taxonomy";
import { cn, formatDate, formatUsd, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { ActivityFeed } from "../../_components/activity-feed";
import { AlertList } from "../../_components/alert-list";
import { HealthBadge, PlatformList, ScorePill, StageBadge } from "../../_components/badges";
import { InlineForm } from "../../_components/client";
import { loadActivity } from "../../_lib/activity";
import { loadOpenAlerts } from "../../_lib/alerts";
import { loadMetrics, loadPortfolio, rollupFor } from "../../_lib/portfolio";
import { listSystems } from "../../_lib/queries";
import { addComment, deleteComment, deleteInitiative, setArchived } from "../actions";
import { DependenciesSection } from "./dependencies-section";
import { GovernanceSection } from "./governance-section";
import { ImpactSection } from "./impact-section";

async function loadInitiative(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(initiatives)
    .where(and(eq(initiatives.id, id), eq(initiatives.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: PageProps<"/w/[slug]/initiatives/[id]">): Promise<Metadata> {
  const { slug, id } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const initiative = await loadInitiative(ctx.org.id, id);
  return { title: initiative?.title ?? "Initiative" };
}

export default async function InitiativePage({ params }: PageProps<"/w/[slug]/initiatives/[id]">) {
  const { slug, id } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const initiative = await loadInitiative(ctx.org.id, id);
  if (!initiative) notFound();
  const base = `/w/${ctx.org.slug}`;
  const canEdit = ctx.can("initiative:write");

  const [portfolio, deps, orgSystems, alerts, thread, activity] = await Promise.all([
    loadPortfolio(ctx.org),
    db
      .select({
        id: dataDependencies.id,
        dataDescription: dataDependencies.dataDescription,
        accessStatus: dataDependencies.accessStatus,
        sensitivity: dataDependencies.sensitivity,
        notes: dataDependencies.notes,
        systemId: systems.id,
        systemName: systems.name,
        systemCategory: systems.category,
      })
      .from(dataDependencies)
      .innerJoin(systems, eq(dataDependencies.systemId, systems.id))
      .where(and(eq(dataDependencies.initiativeId, initiative.id), eq(systems.orgId, ctx.org.id)))
      .orderBy(asc(systems.name)),
    canEdit ? listSystems(ctx.org.id) : Promise.resolve([]),
    loadOpenAlerts(ctx.org.id, { initiativeId: initiative.id, limit: 10 }),
    db
      .select({ id: comments.id, body: comments.body, createdAt: comments.createdAt, userId: comments.userId, userName: user.name })
      .from(comments)
      .leftJoin(user, eq(comments.userId, user.id))
      .where(eq(comments.initiativeId, initiative.id))
      .orderBy(desc(comments.createdAt)),
    loadActivity(ctx.org.id, { initiativeId: initiative.id, limit: 15 }),
  ]);

  const item = portfolio.items.find((i) => i.id === initiative.id);
  const metrics = portfolio.metrics.get(initiative.id) ?? (await loadMetrics([initiative.id])).get(initiative.id) ?? [];
  const rollup = item?.impact ?? rollupFor(metrics, ctx.org);
  const breakdown = scoreBreakdown(initiative, ctx.org.scoringWeights);
  const score = breakdown.reduce((s, p) => s + p.points, 0);
  const activeCount = portfolio.items.filter((i) => i.rank != null).length;
  const cost = firstYearCost(initiative);

  return (
    <>
      <Link href={`${base}/initiatives`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" /> Initiatives
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{initiative.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <StageBadge stage={initiative.stage} />
            <HealthBadge health={initiative.health} />
            {initiative.archivedAt ? <Badge tone="dark">Archived</Badge> : null}
            {initiative.businessUnit ? <span>{initiative.businessUnit}</span> : null}
            {initiative.ownerName ? <span>· Owner: {initiative.ownerName}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {canEdit ? (
            <ButtonLink href={`${base}/initiatives/${initiative.id}/edit`} variant="secondary">
              <Pencil className="size-4" /> Edit
            </ButtonLink>
          ) : null}
          {ctx.can("initiative:delete") ? (
            <InlineForm action={setArchived}>
              <input type="hidden" name="slug" value={ctx.org.slug} />
              <input type="hidden" name="id" value={initiative.id} />
              <input type="hidden" name="archive" value={initiative.archivedAt ? "0" : "1"} />
              {initiative.archivedAt ? (
                <SubmitButton variant="secondary">
                  <ArchiveRestore className="size-4" /> Restore
                </SubmitButton>
              ) : (
                <ConfirmSubmit message="Archive this initiative? It will be hidden from the dashboard and rankings." variant="ghost" size="md">
                  <Archive className="size-4" /> Archive
                </ConfirmSubmit>
              )}
            </InlineForm>
          ) : null}
          {ctx.can("initiative:delete") && initiative.archivedAt ? (
            <InlineForm action={deleteInitiative}>
              <input type="hidden" name="slug" value={ctx.org.slug} />
              <input type="hidden" name="id" value={initiative.id} />
              <ConfirmSubmit message="Permanently delete this initiative, its metrics, dependencies and comments? This cannot be undone." variant="danger" size="md">
                <Trash2 className="size-4" /> Delete
              </ConfirmSubmit>
            </InlineForm>
          ) : null}
        </div>
      </div>

      {initiative.archivedAt ? (
        <Alert tone="warning" className="mb-6">
          Archived {timeAgo(initiative.archivedAt)}. It’s excluded from the dashboard, rankings and alerts.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Overview" />
            <CardBody className="space-y-5">
              <TextBlock label="Problem">{initiative.problemStatement}</TextBlock>
              <TextBlock label="Solution">{initiative.proposedSolution}</TextBlock>
            </CardBody>
          </Card>

          <ImpactSection slug={ctx.org.slug} org={ctx.org} initiative={initiative} metrics={metrics} rollup={rollup} canEdit={ctx.can("impact:write")} />

          <DependenciesSection
            slug={ctx.org.slug}
            initiativeId={initiative.id}
            deps={deps}
            systems={orgSystems}
            canEdit={canEdit}
            canCreateSystem={ctx.can("system:write")}
          />

          <GovernanceSection
            slug={ctx.org.slug}
            org={ctx.org}
            initiative={initiative}
            canEdit={canEdit}
            canApprove={ctx.can("governance:approve")}
          />

          <Card>
            <CardHeader title="Discussion" description={`${thread.length} comment${thread.length === 1 ? "" : "s"}`} />
            <CardBody className="space-y-5">
              {ctx.can("comment:write") ? (
                <ActionForm action={addComment} className="space-y-2" resetOnSuccess>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="initiativeId" value={initiative.id} />
                  <label htmlFor="comment-body" className="sr-only">
                    Add a comment
                  </label>
                  <Textarea id="comment-body" name="body" rows={3} required maxLength={5000} placeholder="Share an update, decision or question…" className="min-h-20" />
                  <div className="flex justify-end">
                    <SubmitButton size="sm">Comment</SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
              {thread.length === 0 ? (
                <p className="text-sm text-slate-500">No comments yet.</p>
              ) : (
                <ul className="space-y-4">
                  {thread.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {initials(c.userName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2 text-sm">
                          <span className="font-medium text-slate-900">{c.userName ?? "Former member"}</span>
                          <time className="text-xs text-slate-500" dateTime={c.createdAt.toISOString()}>
                            {timeAgo(c.createdAt)}
                          </time>
                          {c.userId === ctx.user.id || ctx.can("members:manage") ? (
                            <InlineForm action={deleteComment} className="ml-auto">
                              <input type="hidden" name="slug" value={ctx.org.slug} />
                              <input type="hidden" name="id" value={c.id} />
                              <ConfirmSubmit message="Delete this comment?" className="h-6 px-1.5 text-xs text-slate-400 hover:text-red-600">
                                Delete
                              </ConfirmSubmit>
                            </InlineForm>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm whitespace-pre-line text-slate-700">{c.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title="Prioritization"
              description={
                item?.rank != null ? (
                  <>
                    Rank <span className="font-semibold text-slate-900">#{item.rank}</span> of {activeCount}
                    {item.overridden ? (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-radar-700">
                        <Pin className="size-3" /> pinned
                      </span>
                    ) : null}
                  </>
                ) : (
                  "Not ranked (retired or archived)"
                )
              }
              action={<ScorePill score={Math.round(score * 10) / 10} />}
            />
            <CardBody className="space-y-3">
              {breakdown.map((p) => (
                <div key={p.key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-slate-700">
                      {p.label} <span className="text-xs text-slate-400">· {Math.round(p.weight * 100)}%</span>
                    </span>
                    <span className="tabular-nums text-slate-900">
                      {p.raw}/5 <span className="text-xs text-slate-400">({p.points.toFixed(1)} pts)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100" aria-hidden>
                    <div className="relative h-1.5 rounded-full bg-slate-200" style={{ width: `${p.weight * 100}%` }}>
                      <div className="absolute inset-y-0 left-0 rounded-full bg-radar-500" style={{ width: p.maxPoints > 0 ? `${(p.points / p.maxPoints) * 100}%` : 0 }} />
                    </div>
                  </div>
                </div>
              ))}
              <p className="pt-1 text-xs text-slate-500">
                Score = weighted sum of normalized 1–5 ratings (risk inverted), 0–100. Weights are set in{" "}
                <Link href={`${base}/settings`} className="underline hover:text-slate-800">
                  settings
                </Link>
                .
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Detail label="Executive sponsor">{initiative.sponsor}</Detail>
                <Detail label="Owner">{initiative.ownerName}</Detail>
                <Detail label="Business unit">{initiative.businessUnit}</Detail>
                <Detail label="Build approach">{initiative.buildApproach ? labelFrom(BUILD_APPROACHES, initiative.buildApproach) : null}</Detail>
                <Detail label="Platforms">{initiative.platforms.length ? <PlatformList platforms={initiative.platforms} /> : null}</Detail>
                <Detail label="Models & products">{initiative.models.length ? initiative.models.join(", ") : null}</Detail>
                <Detail label="Target date">{initiative.targetDate ? formatDate(initiative.targetDate) : null}</Detail>
                <Detail label="Launched">{initiative.launchedAt ? formatDate(initiative.launchedAt) : null}</Detail>
                <Detail label="Build cost (est.)">{initiative.estimatedBuildCost != null ? formatUsd(initiative.estimatedBuildCost) : null}</Detail>
                <Detail label="Annual run cost (est.)">{initiative.estimatedAnnualRunCost != null ? formatUsd(initiative.estimatedAnnualRunCost) : null}</Detail>
                {cost != null ? <Detail label="First-year cost">{formatUsd(cost)}</Detail> : null}
                <Detail label="Tags">
                  {initiative.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {initiative.tags.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  ) : null}
                </Detail>
                <Detail label="Created">{formatDate(initiative.createdAt)}</Detail>
                <Detail label="Last updated">{timeAgo(initiative.updatedAt)}</Detail>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Radar alerts" description="News affecting this initiative’s platforms" />
            {alerts.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No open alerts.</p>
              </CardBody>
            ) : (
              <AlertList alerts={alerts} slug={ctx.org.slug} canDismiss={canEdit} showInitiative={false} showSummary={false} />
            )}
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <ActivityFeed rows={activity} slug={ctx.org.slug} showInitiative={false} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function TextBlock({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      {children ? <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-slate-800">{children}</p> : <p className="mt-1 text-sm text-slate-400">Not described yet.</p>}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  const empty = children == null || children === "";
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn("min-w-0", empty ? "text-slate-400" : "text-slate-900")}>{empty ? "—" : children}</dd>
    </div>
  );
}

function initials(name: string | null) {
  return (name ?? "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
