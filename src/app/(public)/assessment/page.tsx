import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Clock,
  Compass,
  Cpu,
  Database,
  FolderKanban,
  Lightbulb,
  ListChecks,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { Alert, ButtonLink } from "@/components/ui";
import { DIMENSIONS, LEVELS, QUESTIONS, type DimensionId } from "@/lib/assessment";
import { TRIAL_INITIATIVE_LIMIT } from "@/lib/taxonomy";
import { DimensionBars, LevelScale, ScoreRing } from "./_components/visuals";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Free AI readiness assessment",
  description:
    "A 5-minute assessment for business leaders. Score your company's AI readiness across strategy, use cases, data, technology, people and governance, and get a prioritized plan.",
  alternates: { canonical: "/assessment" },
};

const DIMENSION_ICONS: Record<DimensionId, typeof Compass> = {
  strategy: Compass,
  value: Target,
  data: Database,
  technology: Cpu,
  people: Users,
  governance: ShieldCheck,
};

const CLAIM_MESSAGES: Record<string, string> = {
  invalid: "That results link is invalid or has expired. You can take the assessment again; it only takes a few minutes.",
  taken: "Those results have already been saved to a different account. Sign in with that account to see them, or take the assessment again.",
};

/** Illustrative example only (clearly labelled), used for the hero preview. */
const EXAMPLE_SCORES = { strategy: 58, value: 44, data: 31, technology: 66, people: 49, governance: 37 };

export default async function AssessmentLandingPage({ searchParams }: PageProps<"/assessment">) {
  const sp = await searchParams;
  const src = typeof sp.src === "string" ? sp.src.replace(/[^\w:.\-]/g, "").slice(0, 80) : "";
  const startHref = `/assessment/start${src ? `?src=${encodeURIComponent(src)}` : ""}`;
  const claimMessage = typeof sp.claim === "string" ? CLAIM_MESSAGES[sp.claim] : undefined;

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(18,179,147,0.18),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div>
            {claimMessage ? (
              <Alert tone="warning" className="mb-6 max-w-xl">
                {claimMessage}
              </Alert>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-radar-300">
              <span className="size-1.5 rounded-full bg-radar-400" /> Free AI readiness assessment
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">How ready is your company for AI?</h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              Answer {QUESTIONS.length} questions across six dimensions and get a scored readiness report: where you stand,
              what&apos;s holding you back, and the first initiatives worth pursuing.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <ButtonLink href={startHref} variant="accent" size="lg">
                Start the assessment <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden /> About 5 minutes
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ListChecks className="size-4" aria-hidden /> No sign-up to start
                </span>
              </div>
            </div>
            <p className="mt-6 text-sm text-slate-400">Built by North Labs, AI consultants to operating teams.</p>
          </div>
          <ExampleReport />
        </div>
      </section>

      {/* What we assess */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Six dimensions of AI readiness</h2>
          <p className="mt-3 text-slate-600">
            Companies rarely stall on the technology alone. The assessment looks at everything an AI initiative needs to reach
            production and pay off.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DIMENSIONS.map((d) => {
            const Icon = DIMENSION_ICONS[d.id];
            return (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex size-10 items-center justify-center rounded-lg bg-radar-50 text-radar-700">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{d.label}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{d.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* What you get */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">What you get</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: BarChart3,
                title: "A scored readiness report",
                body: "An overall score, your maturity level and a 0–100 score for each dimension, shown instantly.",
              },
              {
                icon: Lightbulb,
                title: "Gaps and next steps",
                body: "Your weakest areas, explained in plain language, with concrete next steps for each one.",
              },
              {
                icon: FolderKanban,
                title: "A free starter AI portfolio",
                body: `Suggested initiatives for the functions you care about, ready to load into a free workspace (up to ${TRIAL_INITIATIVE_LIMIT} initiatives).`,
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="size-5 text-radar-600" aria-hidden />
                <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Maturity levels */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Four levels of AI maturity</h2>
        <p className="mt-2 max-w-2xl text-slate-600">Your overall score places you on one of four levels, each with a different focus.</p>
        <ol className="mt-8 grid gap-4 md:grid-cols-4">
          {LEVELS.map((l, i) => (
            <li key={l.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="text-xs font-semibold uppercase tracking-wide text-radar-700">
                Level {i + 1} · {l.min}
                {i < LEVELS.length - 1 ? `–${LEVELS[i + 1].min - 1}` : "–100"}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{l.label}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{l.summary}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Questions</h2>
          <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                  {f.q}
                  <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink-900">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">Find out where AI should go first.</h2>
            <p className="mt-1 text-slate-300">Five minutes. Free. Your scores appear instantly.</p>
          </div>
          <ButtonLink href={startHref} variant="accent" size="lg">
            Start the assessment <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

const FAQ = [
  {
    q: "Who is this for?",
    a: "Business and technology leaders who want an honest view of how prepared their company is to get value from AI, whether you're just starting or already running AI in production.",
  },
  {
    q: "Is it really free?",
    a: `Yes. Your overall score and dimension scores appear as soon as you finish. To see the full report with recommendations and starter initiatives, create a free ${BRAND} account with your work email.`,
  },
  {
    q: "How is my score calculated?",
    a: "Each answer scores 0 to 4. Each dimension's score is the average of its answers on a 0–100 scale, and your overall score is the average of the six dimensions. Recommendations are based on which dimensions score lowest.",
  },
  {
    q: "What happens to my answers?",
    a: "Your answers are stored with your report so you can come back to it. North Labs may use them to understand how we can help, and may reach out. We never sell your information.",
  },
  {
    q: "Who is North Labs?",
    a: "North Labs is an AI consultancy that helps companies decide where AI should go first, build it on the right platform, and measure the impact.",
  },
];

function ExampleReport() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white p-5 text-slate-900 shadow-2xl shadow-black/30 sm:p-6" aria-hidden>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium uppercase tracking-wide">Example report</span>
        <span>Illustrative scores</span>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <ScoreRing score={48} size={112} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500">Maturity level</div>
          <div className="text-xl font-semibold">Experimenting</div>
          <div className="mt-3">
            <LevelScale levelId="experimenting" />
          </div>
        </div>
      </div>
      <DimensionBars scores={EXAMPLE_SCORES} showBand={false} className="mt-6 space-y-3" />
      <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Focus first: <strong>Data readiness</strong>. Map the systems your top use cases depend on.
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-400">Your report is tailored to your answers</p>
    </div>
  );
}
