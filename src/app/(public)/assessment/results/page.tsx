import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { functionLabel } from "@/lib/assessment";
import { findByToken, summarize } from "@/lib/assessment/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BandLegend, DimensionBars, LevelScale, ScoreRing } from "../_components/visuals";
import { EmailGate } from "../_components/email-gate";

export const metadata: Metadata = {
  title: "Your AI readiness results",
  robots: { index: false, follow: false },
  // The URL carries the claim token: never leak it to other sites.
  referrer: "no-referrer",
};

/** Results teaser for an anonymous assessment: scores up front, the full report behind sign-up. */
export default async function AssessmentResultsPage({ searchParams }: PageProps<"/assessment/results">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const [assessment, current] = await Promise.all([findByToken(token), getCurrentUser()]);
  if (!assessment) notFound();

  if (assessment.userId) {
    if (current?.id === assessment.userId) redirect(`/assessment/${assessment.id}`);
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <Lock className="mx-auto size-8 text-slate-400" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">These results are saved to an account</h1>
        <p className="mt-2 text-slate-600">Sign in with the account that saved them to see the full report.</p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/assessment/${assessment.id}`)}`}>Sign in</ButtonLink>
          <ButtonLink href="/assessment" variant="secondary">
            Take the assessment
          </ButtonLink>
        </div>
      </div>
    );
  }

  const { level, overall, recs, templates, context } = summarize(assessment);
  const claimPath = `/assessment/claim?token=${encodeURIComponent(token)}`;
  const focus = context?.functions.map(functionLabel).join(", ");

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="text-xs font-semibold uppercase tracking-wide text-radar-700">Your results</div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Your AI readiness: {level?.label ?? assessment.level}
      </h1>

      {/* DOM order puts the gate right after the scores on mobile; on desktop it is a sticky sidebar. */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card className="min-w-0 p-6 lg:col-start-1">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <ScoreRing score={overall} size={148} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-500">Maturity level</div>
              <div className="text-2xl font-semibold text-slate-900">{level?.label}</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{level?.summary}</p>
              <div className="mt-4">
                <LevelScale levelId={assessment.level} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="min-w-0 p-6 lg:col-start-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="font-semibold text-slate-900">Scores by dimension</h2>
            <BandLegend />
          </div>
          <DimensionBars scores={assessment.scores} className="mt-5" />
        </Card>

        <aside id="full-report" className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
          <Card className="overflow-hidden">
            <div className="bg-ink-900 px-6 py-5 text-white">
              <h2 className="text-lg font-semibold">Get your full report</h2>
              <p className="mt-1 text-sm text-slate-300">Free with an AI Radar account. We&apos;ll also email you a copy.</p>
            </div>
            <div className="space-y-5 px-6 py-5">
              <ul className="space-y-2.5 text-sm text-slate-700">
                {[
                  "Your strengths and gaps, explained",
                  "Next steps for your three priority areas",
                  `${templates.length} starter initiatives matched to your focus areas`,
                  "A free AI portfolio workspace, pre-filled for you",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-radar-600" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
              {current ? (
                <div>
                  <p className="mb-3 text-sm text-slate-600">
                    Signed in as <span className="font-medium text-slate-900">{current.email}</span>.
                  </p>
                  <ButtonLink href={claimPath} variant="accent" size="lg" className="w-full" prefetch={false}>
                    Save to my account
                  </ButtonLink>
                </div>
              ) : (
                <>
                  <EmailGate claimPath={claimPath} />
                  <p className="text-center text-sm text-slate-500">
                    Already have an account?{" "}
                    <Link href={`/sign-in?next=${encodeURIComponent(claimPath)}`} className="font-medium text-radar-700 hover:underline" prefetch={false}>
                      Sign in
                    </Link>
                  </p>
                </>
              )}
            </div>
          </Card>
        </aside>

        {/* Locked preview of the full report */}
        <Card className="relative min-w-0 overflow-hidden p-6 lg:col-start-1">
          <h2 className="font-semibold text-slate-900">Where to focus first</h2>
          <ol className="mt-4 space-y-4">
            {recs.priorities.map((p, i) => (
              <li key={p.dimension} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{p.label}</div>
                  <div className="mt-2 space-y-1.5 blur-[3px] select-none" aria-hidden>
                    <div className="h-2.5 w-11/12 rounded bg-slate-200" />
                    <div className="h-2.5 w-4/5 rounded bg-slate-200" />
                    <div className="h-2.5 w-2/3 rounded bg-slate-200" />
                  </div>
                </div>
              </li>
            ))}
            {recs.priorities.length === 0 ? <li className="text-sm text-slate-600">No major gaps. Your report covers how to keep compounding.</li> : null}
          </ol>
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h2 className="font-semibold text-slate-900">{templates.length} starter initiatives{focus ? ` for ${focus}` : ""}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 blur-[3px] select-none" aria-hidden>
              {templates.slice(0, 4).map((t) => (
                <div key={t.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="h-3 w-3/4 rounded bg-slate-300" />
                  <div className="mt-2 h-2 w-full rounded bg-slate-200" />
                  <div className="mt-1.5 h-2 w-5/6 rounded bg-slate-200" />
                </div>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
          <div className="relative mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
            <Lock className="size-4 text-slate-400" aria-hidden /> Included in your full report
          </div>
        </Card>
      </div>
    </div>
  );
}
