import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight, CheckCircle2, Eye, FolderKanban, MessagesSquare, RotateCcw, Sparkles, TrendingUp } from "lucide-react";
import { db } from "@/db";
import { organizations, user as userTable } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader } from "@/components/ui";
import { functionLabel, insightFor, DIMENSIONS, type StarterTemplate } from "@/lib/assessment";
import { companyNameFor, describeContext, findForViewer, summarize } from "@/lib/assessment/server";
import { getCurrentUser } from "@/lib/auth/session";
import { TRIAL_INITIATIVE_LIMIT } from "@/lib/taxonomy";
import { formatDate } from "@/lib/utils";
import { createStarterWorkspace } from "../actions";
import { BandLegend, DimensionBars, LevelScale, ScoreRing } from "../_components/visuals";

export const metadata: Metadata = {
  title: "AI readiness report",
  robots: { index: false, follow: false },
};

export default async function AssessmentReportPage({ params, searchParams }: PageProps<"/assessment/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const current = await getCurrentUser();
  if (!current) redirect(`/sign-in?next=${encodeURIComponent(`/assessment/${id}`)}`);
  const assessment = await findForViewer(id, current);
  if (!assessment) notFound();

  const isOwner = assessment.userId === current.id;
  const [[owner], [org]] = await Promise.all([
    assessment.userId && !isOwner
      ? db.select().from(userTable).where(eq(userTable.id, assessment.userId)).limit(1)
      : Promise.resolve([isOwner ? current : undefined]),
    assessment.orgId
      ? db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name }).from(organizations).where(eq(organizations.id, assessment.orgId)).limit(1)
      : Promise.resolve([]),
  ]);

  const { level, overall, recs, templates, context } = summarize(assessment);
  const company = owner ? companyNameFor(owner) : "Anonymous visitor";
  const otherGaps = recs.gaps.slice(recs.priorities.length);
  const welcome = sp.welcome === "1" && isOwner;

  return (
    <>
      {!isOwner ? (
        <div className="border-b border-violet-200 bg-violet-50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-violet-900 sm:px-6">
            <Eye className="size-4" aria-hidden />
            <span>
              Viewing as North Labs staff ·{" "}
              {owner ? (
                <Link href={`/admin/leads/${owner.id}`} className="font-medium underline-offset-2 hover:underline">
                  {owner.name} ({owner.email})
                </Link>
              ) : (
                "unclaimed assessment"
              )}
            </span>
          </div>
        </div>
      ) : null}

      {/* Summary */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(18,179,147,0.16),transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          {welcome ? (
            <Alert tone="success" className="mb-6 max-w-2xl">
              Your report is saved to your account, and we&apos;ve emailed you a copy.
            </Alert>
          ) : null}
          <div className="text-xs font-semibold uppercase tracking-wide text-radar-300">AI readiness report</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{company}</h1>
          <p className="mt-1 text-sm text-slate-400">Completed {formatDate(assessment.createdAt)}</p>
          <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-center">
            <ScoreRing score={overall} size={168} dark />
            <div className="min-w-0 max-w-2xl flex-1">
              <div className="text-sm text-slate-400">Maturity level</div>
              <div className="text-3xl font-semibold">{level?.label ?? assessment.level}</div>
              <p className="mt-2 leading-relaxed text-slate-300">{level?.summary}</p>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                <span className="font-semibold text-radar-300">Your focus: </span>
                {level?.focus}
              </p>
              <div className="mt-5 max-w-md">
                <LevelScale levelId={assessment.level} dark />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* Dimension breakdown */}
          <Card className="min-w-0">
            <CardHeader title="Scores by dimension" description="Each dimension is scored 0–100 from your answers." />
            <CardBody>
              <DimensionBars
                scores={assessment.scores}
                notes={Object.fromEntries(DIMENSIONS.map((d) => [d.id, insightFor(d.id, Number(assessment.scores[d.id] ?? 0)).headline]))}
                className="space-y-5"
              />
              <BandLegend className="mt-6 border-t border-slate-100 pt-4" />
            </CardBody>
          </Card>

          <div className="min-w-0 space-y-6">
            <Card>
              <CardHeader title="Your profile" />
              <CardBody>
                <dl className="space-y-3 text-sm">
                  {describeContext(context).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k}</dt>
                      <dd className="mt-0.5 text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardBody>
            </Card>
            <TalkCard />
          </div>
        </div>

        {/* Strengths */}
        {recs.strengths.length ? (
          <section aria-labelledby="strengths">
            <h2 id="strengths" className="text-2xl font-semibold tracking-tight text-slate-900">
              Strengths to build on
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recs.strengths.map((s) => (
                <Card key={s.dimension} className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                      <TrendingUp className="size-4 text-radar-600" aria-hidden /> {s.label}
                    </span>
                    <Badge tone="radar">{s.score}</Badge>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.headline}</p>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* Gaps */}
        <section aria-labelledby="priorities">
          <h2 id="priorities" className="text-2xl font-semibold tracking-tight text-slate-900">
            Where to focus first
          </h2>
          {recs.priorities.length === 0 ? (
            <p className="mt-3 text-slate-600">
              No dimension scored below 70. Keep compounding: expand to more functions, automate end-to-end workflows and
              re-prioritize your portfolio as models and prices change.
            </p>
          ) : (
            <>
              <p className="mt-2 max-w-3xl text-slate-600">Your lowest-scoring dimensions, with practical next steps for each.</p>
              <ol className="mt-5 grid gap-4 lg:grid-cols-3">
                {recs.priorities.map((p, i) => (
                  <li key={p.dimension}>
                    <Card className="h-full p-5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <span className="flex size-6 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">{i + 1}</span>
                          <span className="font-semibold text-slate-900">{p.label}</span>
                        </span>
                        <Badge tone={p.band === "foundational" ? "amber" : "blue"}>{p.score}</Badge>
                      </div>
                      <p className="mt-3 font-medium leading-snug text-slate-900">{p.headline}</p>
                      <ul className="mt-3 space-y-2">
                        {p.nextSteps.map((step) => (
                          <li key={step} className="flex gap-2 text-sm leading-relaxed text-slate-600">
                            <ArrowRight className="mt-1 size-3.5 shrink-0 text-radar-600" aria-hidden /> {step}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </li>
                ))}
              </ol>
              {otherGaps.length ? (
                <div className="mt-4 space-y-2">
                  {otherGaps.map((g) => (
                    <details key={g.dimension} className="group rounded-xl border border-slate-200 bg-white px-5 py-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                        <span>
                          <span className="font-semibold text-slate-900">{g.label}</span>
                          <span className="text-slate-500"> · {g.headline}</span>
                        </span>
                        <Badge tone={g.band === "foundational" ? "amber" : "blue"}>{g.score}</Badge>
                      </summary>
                      <ul className="mt-3 space-y-2">
                        {g.nextSteps.map((step) => (
                          <li key={step} className="flex gap-2 text-sm text-slate-600">
                            <ArrowRight className="mt-1 size-3.5 shrink-0 text-radar-600" aria-hidden /> {step}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </section>

        {/* Starter initiatives */}
        <section aria-labelledby="starters">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 id="starters" className="text-2xl font-semibold tracking-tight text-slate-900">
                Suggested starter initiatives
              </h2>
              <p className="mt-2 text-slate-600">
                Matched to {context ? context.functions.map(functionLabel).join(", ") : "your focus areas"} and your readiness level.
                Scores are starting points on a 1–5 scale; adjust them to your situation.
              </p>
            </div>
          </div>

          <Card className="mt-5 overflow-hidden border-radar-200">
            <div className="flex flex-col gap-4 bg-radar-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <FolderKanban className="mt-0.5 size-5 shrink-0 text-radar-700" aria-hidden />
                <div>
                  <div className="font-semibold text-slate-900">{org ? "Your free AI portfolio is ready" : "Turn these into your AI portfolio"}</div>
                  <p className="text-sm text-slate-600">
                    {org
                      ? `Prioritize, score and track these initiatives in ${org.name}.`
                      : `Create a free workspace pre-filled with these initiatives, ranked by value, feasibility, alignment and risk. Free workspaces hold up to ${TRIAL_INITIATIVE_LIMIT} initiatives.`}
                  </p>
                </div>
              </div>
              <div className="shrink-0">
                {org ? (
                  isOwner ? (
                    <ButtonLink href={`/w/${org.slug}`}>
                      Open my AI portfolio <ArrowRight className="size-4" aria-hidden />
                    </ButtonLink>
                  ) : (
                    <ButtonLink href={`/admin/workspaces/${org.id}`} variant="secondary">
                      View workspace
                    </ButtonLink>
                  )
                ) : isOwner && templates.length ? (
                  <ActionForm action={createStarterWorkspace} className="space-y-2">
                    <input type="hidden" name="assessmentId" value={assessment.id} />
                    <SubmitButton pendingText="Creating your portfolio…">
                      <Sparkles className="size-4" aria-hidden /> Create my free AI portfolio
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            </div>
          </Card>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {templates.map((t) => (
              <StarterCard key={t.id} template={t} />
            ))}
          </div>
        </section>

        {/* Talk to North Labs */}
        <section className="overflow-hidden rounded-2xl bg-ink-900 text-white">
          <div className="grid gap-6 px-6 py-10 sm:px-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-2xl font-semibold">Talk to North Labs about your results</h2>
              <p className="mt-2 max-w-2xl text-slate-300">
                A 30-minute conversation with an AI consultant: we&apos;ll walk through your scores, pressure-test the starter
                initiatives and suggest the fastest route to measurable impact. No obligation.
              </p>
            </div>
            <ButtonLink href="/contact?from=assessment" variant="accent" size="lg">
              <MessagesSquare className="size-4" aria-hidden /> Book a results review
            </ButtonLink>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span>Scores reflect your answers on {formatDate(assessment.createdAt)}. Retake the assessment anytime to track progress.</span>
          <Link href="/assessment/start?src=retake" className="inline-flex items-center gap-1.5 font-medium text-radar-700 hover:underline">
            <RotateCcw className="size-4" aria-hidden /> Retake the assessment
          </Link>
        </div>
      </div>
    </>
  );
}

function TalkCard() {
  return (
    <Card className="p-5">
      <MessagesSquare className="size-5 text-radar-600" aria-hidden />
      <h2 className="mt-3 font-semibold text-slate-900">Want a second opinion?</h2>
      <p className="mt-1 text-sm text-slate-600">North Labs consultants can review your results with you and help plan the first initiatives.</p>
      <ButtonLink href="/contact?from=assessment" variant="secondary" className="mt-4 w-full">
        Talk to North Labs
      </ButtonLink>
    </Card>
  );
}

const EFFORT_TONE = { Low: "radar", Medium: "blue", High: "violet" } as const;

function StarterCard({ template: t }: { template: StarterTemplate }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge>{t.function === "cross_functional" ? "Company-wide" : functionLabel(t.function)}</Badge>
        <Badge tone={EFFORT_TONE[t.effort]}>{t.effort} effort</Badge>
        {t.customerFacing ? <Badge tone="amber">Customer-facing</Badge> : null}
      </div>
      <h3 className="mt-3 font-semibold text-slate-900">{t.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        <span className="font-medium text-slate-800">Problem: </span>
        {t.problem}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        <span className="font-medium text-slate-800">Approach: </span>
        {t.solution}
      </p>
      <ul className="mt-3 space-y-1">
        {t.valueDrivers.map((v) => (
          <li key={v} className="flex gap-2 text-sm text-slate-700">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-radar-600" aria-hidden /> {v}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-4">
        <div className="grid grid-cols-4 gap-2 border-t border-slate-100 pt-3 text-center">
          {(
            [
              ["Value", t.scores.value],
              ["Feasibility", t.scores.feasibility],
              ["Alignment", t.scores.alignment],
              ["Risk", t.scores.risk],
            ] as const
          ).map(([label, v]) => (
            <div key={label}>
              <div className="text-[11px] text-slate-500">{label}</div>
              <div className="text-sm font-semibold tabular-nums text-slate-900">{v}/5</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
