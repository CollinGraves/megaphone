import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { CheckCircle2, ChevronLeft, Clock, Copy, Plus, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Alert, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { db } from "@/db";
import { ideas, initiatives, user, type Idea } from "@/db/schema";
import { MAX_HOURS_PER_WEEK, SIGNAL_LABELS, WEEKS_PER_YEAR, estimateAnnualHours, frequencyLabel, ideaSignal } from "@/lib/ideas";
import { initiativeCapMessage, initiativeLimit } from "@/lib/plans";
import { formatDate, formatNumber, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound, type WorkspaceContext } from "@/lib/workspace";
import { StageBadge } from "../../_components/badges";
import { listBusinessUnits } from "../../_lib/queries";
import { ChannelLabel, IdeaStatusBadge, SignalMeter, UrgencyBadge } from "../_components/badges";
import { loadIdeaHistory } from "../_lib/server";
import { TriagePanel } from "./triage-panel";

/** Triagers can open any idea in the workspace; everyone else only their own. */
async function loadVisibleIdea(ctx: WorkspaceContext, id: string): Promise<Idea | null> {
  if (!/^[\w-]{1,100}$/.test(id)) return null;
  const [row] = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.orgId, ctx.org.id), ctx.can("ideas:triage") ? undefined : eq(ideas.submittedById, ctx.user.id)))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: PageProps<"/w/[slug]/ideas/[ideaId]">): Promise<Metadata> {
  const { slug, ideaId } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const idea = await loadVisibleIdea(ctx, ideaId);
  // 404 here as well as in the page: a page-level notFound() while metadata is still resolving 500s in dev.
  if (!idea) notFound();
  return { title: idea.title };
}

export default async function IdeaPage({ params, searchParams }: PageProps<"/w/[slug]/ideas/[ideaId]">) {
  const { slug, ideaId } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  const idea = await loadVisibleIdea(ctx, ideaId);
  if (!idea) notFound();
  const base = `/w/${ctx.org.slug}`;
  const canTriage = ctx.can("ideas:triage");
  const triageOpen = canTriage && idea.status !== "accepted";

  const capped = initiativeLimit(ctx.org.plan) != null;
  const [linkedInitiative, duplicateOf, triager, history, businessUnits, candidateInitiatives, candidateIdeas, activeCount] = await Promise.all([
    idea.initiativeId
      ? db
          .select({ id: initiatives.id, title: initiatives.title, stage: initiatives.stage, archivedAt: initiatives.archivedAt })
          .from(initiatives)
          .where(and(eq(initiatives.id, idea.initiativeId), eq(initiatives.orgId, ctx.org.id)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
    idea.duplicateOfId
      ? db
          .select({ id: ideas.id, title: ideas.title, status: ideas.status })
          .from(ideas)
          .where(and(eq(ideas.id, idea.duplicateOfId), eq(ideas.orgId, ctx.org.id)))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null,
    idea.triagedById ? db.select({ name: user.name }).from(user).where(eq(user.id, idea.triagedById)).limit(1).then((r) => r[0]?.name ?? null) : null,
    canTriage ? loadIdeaHistory(ctx.org.id, idea.id) : [],
    triageOpen ? listBusinessUnits(ctx.org.id) : [],
    triageOpen
      ? db
          .select({ id: initiatives.id, title: initiatives.title })
          .from(initiatives)
          .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt)))
          .orderBy(asc(initiatives.title))
      : [],
    triageOpen
      ? db
          .select({ id: ideas.id, title: ideas.title, status: ideas.status })
          .from(ideas)
          .where(and(eq(ideas.orgId, ctx.org.id), ne(ideas.id, idea.id), ne(ideas.status, "duplicate")))
          .orderBy(desc(ideas.createdAt))
          .limit(150)
      : [],
    triageOpen && capped
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(initiatives)
          .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt)))
          .then((r) => r[0]?.n ?? 0)
      : 0,
  ]);

  const annualHours = estimateAnnualHours(idea);
  const signal = ideaSignal(idea);
  const mine = idea.submittedById === ctx.user.id;

  return (
    <>
      <Link href={`${base}/ideas`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" /> {canTriage ? "Ideas" : "My ideas"}
      </Link>

      {sp.submitted && mine ? (
        <Alert tone="success" className="mb-5">
          <span className="font-medium">Thanks — your idea is in.</span> {ctx.org.name}’s AI team will review it, and you’ll get an email when they decide. You can follow it here any time.
        </Alert>
      ) : null}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{idea.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <IdeaStatusBadge status={idea.status} />
            <UrgencyBadge urgency={idea.urgency} />
            <span className="text-xs">
              {mine ? "You submitted this" : `Submitted by ${idea.submitterName}`} {timeAgo(idea.createdAt)}
            </span>
          </div>
        </div>
        {!canTriage ? (
          <ButtonLink href={`${base}/ideas/new`} variant="secondary" className="shrink-0">
            <Plus className="size-4" /> Submit another idea
          </ButtonLink>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="The idea" />
            <CardBody className="space-y-5">
              <TextBlock label="Problem">{idea.problem}</TextBlock>
              <TextBlock label="What good would look like">{idea.desiredOutcome}</TextBlock>
              <TextBlock label="Systems or data involved">{idea.systemsInvolved}</TextBlock>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Size of the opportunity" description="The submitter’s rough estimate of the task as it is today." />
            <CardBody>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                <Metric label="How often">{frequencyLabel(idea.frequency) ?? "—"}</Metric>
                <Metric label="People affected">{idea.peopleAffected != null ? formatNumber(idea.peopleAffected) : "—"}</Metric>
                <Metric label="Hours / week / person">{idea.hoursPerWeek != null ? formatNumber(idea.hoursPerWeek) : "—"}</Metric>
                <Metric label="Hours / yr today">{annualHours != null ? formatNumber(annualHours) : "—"}</Metric>
              </dl>
              <div className="mt-4 flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-2">
                  <SignalMeter idea={idea} />
                  <span>
                    <span className="font-medium text-slate-700">{SIGNAL_LABELS[signal.level]}</span>
                    {signal.reasons.length ? ` — ${signal.reasons.join(", ")}` : ""}
                  </span>
                </span>
                {annualHours != null ? (
                  <span>
                    {idea.hoursPerWeek! > MAX_HOURS_PER_WEEK ? `${MAX_HOURS_PER_WEEK} (capped)` : formatNumber(idea.hoursPerWeek)} h × {formatNumber(idea.peopleAffected ?? 1)}
                    {idea.peopleAffected == null ? " (assumed)" : ""} × {WEEKS_PER_YEAR} weeks
                  </span>
                ) : null}
              </div>
            </CardBody>
          </Card>

          {triageOpen ? (
            <TriagePanel
              slug={ctx.org.slug}
              idea={idea}
              businessUnits={businessUnits}
              candidates={{ initiatives: candidateInitiatives, ideas: candidateIdeas }}
              capMessage={capped ? initiativeCapMessage(ctx.org.plan, activeCount) : null}
              billingHref={ctx.can("billing:manage") ? `${base}/billing?upgrade=initiatives` : null}
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Outcome" />
            <CardBody className="space-y-3 text-sm">
              <Outcome idea={idea} base={base} linkedInitiative={linkedInitiative} duplicateOf={duplicateOf} canTriage={canTriage} />
              {idea.triagedAt && idea.status !== "new" ? (
                <p className="text-xs text-slate-500">
                  {triager ? `Last triaged by ${triager}` : "Last triaged"} {timeAgo(idea.triagedAt)}
                </p>
              ) : null}
              {canTriage && idea.triageNotes ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">Internal notes</div>
                  <p className="mt-0.5 whitespace-pre-line text-slate-700">{idea.triageNotes}</p>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Submitted by" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <Detail label="Name">{idea.submitterName}</Detail>
                <Detail label="Email">
                  <a href={`mailto:${idea.submitterEmail}`} className="text-slate-900 [overflow-wrap:anywhere] hover:text-radar-700 hover:underline">
                    {idea.submitterEmail}
                  </a>
                </Detail>
                <Detail label="Department">{idea.department}</Detail>
                <Detail label="Channel">
                  <ChannelLabel channel={idea.channel} className="text-slate-900" />
                </Detail>
                <Detail label="Submitted">{formatDate(idea.createdAt)}</Detail>
              </dl>
            </CardBody>
          </Card>

          {canTriage ? (
            <Card>
              <CardHeader title="History" />
              <CardBody>
                {history.length === 0 ? (
                  <p className="text-sm text-slate-500">No activity yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {history.map((h) => (
                      <li key={h.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-slate-700">
                            <span className="font-medium text-slate-900">{h.userName ?? (h.action === "idea.submitted" ? idea.submitterName : "Someone")}</span>{" "}
                            {describeIdeaActivity(h.action, h.detail)}
                          </p>
                          <time className="text-xs text-slate-500" dateTime={h.createdAt.toISOString()}>
                            {timeAgo(h.createdAt)}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Outcome({
  idea,
  base,
  linkedInitiative,
  duplicateOf,
  canTriage,
}: {
  idea: Idea;
  base: string;
  linkedInitiative: { id: string; title: string; stage: string; archivedAt: Date | null } | null;
  duplicateOf: { id: string; title: string; status: string } | null;
  canTriage: boolean;
}) {
  const initiativeLink = linkedInitiative ? (
    <Link href={`${base}/initiatives/${linkedInitiative.id}`} className="font-medium text-slate-900 hover:text-radar-700 hover:underline">
      {linkedInitiative.title}
    </Link>
  ) : null;

  switch (idea.status) {
    case "accepted":
      return (
        <OutcomeRow icon={<CheckCircle2 className="size-5 text-radar-600" />} title="Accepted onto the AI roadmap">
          {linkedInitiative ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {initiativeLink} <StageBadge stage={linkedInitiative.stage} />
            </div>
          ) : (
            <p className="text-slate-500">The initiative it became has since been deleted.</p>
          )}
        </OutcomeRow>
      );
    case "declined":
      return (
        <OutcomeRow icon={<XCircle className="size-5 text-slate-400" />} title="Not taken forward">
          {idea.declineReason ? <p className="mt-1 whitespace-pre-line text-slate-600">{idea.declineReason}</p> : null}
        </OutcomeRow>
      );
    case "duplicate":
      return (
        <OutcomeRow icon={<Copy className="size-5 text-violet-500" />} title="Duplicate">
          <p className="mt-1 text-slate-600">
            {duplicateOf ? (
              <>
                Of the idea{" "}
                {canTriage ? (
                  <Link href={`${base}/ideas/${duplicateOf.id}`} className="font-medium text-slate-900 hover:text-radar-700 hover:underline">
                    {duplicateOf.title}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-900">{duplicateOf.title}</span>
                )}
                {linkedInitiative ? <>, now the initiative {initiativeLink}</> : null}.
              </>
            ) : linkedInitiative ? (
              <>Already on the roadmap as {initiativeLink}.</>
            ) : (
              "Tracked elsewhere."
            )}
          </p>
        </OutcomeRow>
      );
    case "under_review":
      return (
        <OutcomeRow icon={<Clock className="size-5 text-sky-500" />} title="Under review">
          <p className="mt-1 text-slate-600">The AI team is looking into it.</p>
        </OutcomeRow>
      );
    default:
      return (
        <OutcomeRow icon={<Clock className="size-5 text-amber-500" />} title="Waiting for triage">
          <p className="mt-1 text-slate-600">{canTriage ? "Nobody has picked this up yet." : "The AI team hasn’t reviewed it yet."}</p>
        </OutcomeRow>
      );
  }
}

function OutcomeRow({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="font-medium text-slate-900">{title}</div>
        {children}
      </div>
    </div>
  );
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function describeIdeaActivity(action: string, detail: Record<string, unknown> | null): string {
  const d = detail ?? {};
  switch (action) {
    case "idea.submitted":
      return d.channel === "intake_link" ? "submitted the idea through the intake link" : "submitted the idea";
    case "idea.under_review":
      return "moved it to under review";
    case "idea.reopened":
      return "reopened it for review";
    case "idea.notes_updated":
      return "updated the review notes";
    case "idea.accepted":
      return `converted it to the initiative “${str(d.initiativeTitle)}”`;
    case "idea.declined":
      return d.notified ? "declined it and emailed the submitter" : "declined it";
    case "idea.duplicate":
      return `marked it as a duplicate of “${str(d.of)}”`;
    default:
      return action.replace(/[._]/g, " ");
  }
}

function TextBlock({ label, children }: { label: string; children: string | null }) {
  if (!children) return null;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</h3>
      <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{children}</p>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{children}</dd>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.75rem_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-900">{children ?? <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}
