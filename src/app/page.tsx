import Link from "next/link";
import { and, count, eq, gte } from "drizzle-orm";
import { ArrowRight, Bell, Database, Gauge, Layers, ListOrdered, Radar, Sparkles, TrendingUp } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { StoryCard } from "@/components/stories/story-card";
import { ButtonLink } from "@/components/ui";
import { db } from "@/db";
import { sources, stories } from "@/db/schema";
import { listStories } from "@/lib/stories";
import { CATEGORIES } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function getStats() {
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [[s], [st]] = await Promise.all([
    db.select({ n: count() }).from(sources).where(eq(sources.active, true)),
    db.select({ n: count() }).from(stories).where(and(eq(stories.status, "published"), gte(stories.publishedAt, weekAgo))),
  ]);
  return { sources: s?.n ?? 0, storiesThisWeek: st?.n ?? 0 };
}

export default async function HomePage() {
  const [top, stats] = await Promise.all([listStories({ sinceDays: 7, order: "top", limit: 3 }), getStats()]);

  return (
    <>
      <SiteHeader dark />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-ink-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(18,179,147,0.18),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-radar-300">
                <span className="size-1.5 rounded-full bg-radar-400" /> Tracking {formatNumber(stats.sources)} sources · {formatNumber(stats.storiesThisWeek)} stories this week
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Every AI update that matters.
                <span className="block text-radar-400">None of the noise.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-300">
                AI Radar watches vendor announcements, research, regulators and the press, merges duplicate coverage, ranks
                what&apos;s significant, and delivers only the updates you care about, in one feed and one short digest.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/sign-up" variant="accent" size="lg">
                  Get your free radar <ArrowRight className="size-4" />
                </ButtonLink>
                <ButtonLink href="/radar" size="lg" className="border border-white/15 bg-white/5 text-white hover:bg-white/10">
                  See this week&apos;s top stories
                </ButtonLink>
              </div>
            </div>
            <RadarVisual />
          </div>
        </section>

        {/* This week */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">This week on the radar</h2>
              <p className="mt-1 text-slate-600">The most significant stories of the last seven days.</p>
            </div>
            <Link href="/radar" className="hidden text-sm font-medium text-radar-700 hover:underline sm:block">
              All top stories →
            </Link>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            {top.map((s) => (
              <StoryCard key={s.id} story={s} />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">How AI Radar works</h2>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {[
                { icon: Radar, title: "We watch everything", body: "First-party vendor blogs and newsrooms, research feeds, regulators, trade press and community signals, checked every hour." },
                { icon: Layers, title: "We separate signal from noise", body: "Forty articles about one launch become one story. Each story is summarized, tagged and scored for significance." },
                { icon: Bell, title: "You get what matters to you", body: "Choose topics, companies and industries. Read your feed anytime, or get a daily or weekly digest." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <div className="flex size-10 items-center justify-center rounded-lg bg-radar-50 text-radar-700">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Link key={c.slug} href={`/radar/topics/${c.slug}`} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-radar-400 hover:text-radar-800">
                  {c.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Workspace */}
        <section id="workspace" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-radar-700">AI Radar Workspace · for North Labs clients</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Your company&apos;s AI portfolio, in one place</h2>
              <p className="mt-3 text-slate-600">
                Most companies have AI work spread across Claude, ChatGPT, Copilot, Gemini and in-house builds, with no
                shared view of what&apos;s being solved or whether it&apos;s paying off. The Workspace is that shared view.
              </p>
              <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                {[
                  { icon: ListOrdered, title: "Prioritized initiative list", body: "Every initiative scored on value, feasibility, alignment and risk." },
                  { icon: TrendingUp, title: "Measured impact", body: "Hours saved, cost reduced and revenue generated, estimated and actual." },
                  { icon: Database, title: "Data dependencies", body: "Which systems and datasets each initiative needs, and what's blocked." },
                  { icon: Sparkles, title: "Alerts tied to your stack", body: "A price change or deprecation from a vendor you use is flagged on the initiatives it affects." },
                ].map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-radar-600" />
                    <div>
                      <div className="font-medium text-slate-900">{title}</div>
                      <div className="text-sm text-slate-600">{body}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/contact?from=workspace" size="lg">
                  Talk to North Labs
                </ButtonLink>
              </div>
            </div>
            <WorkspacePreview />
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-ink-900">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">Stop scrolling ten feeds to keep up with AI.</h2>
              <p className="mt-1 text-slate-300">Set up your radar in 30 seconds. Free.</p>
            </div>
            <ButtonLink href="/sign-up" variant="accent" size="lg">
              Get your free radar
            </ButtonLink>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function RadarVisual() {
  const blips = [
    { x: 68, y: 30, label: "Model release" },
    { x: 30, y: 62, label: "Pricing change" },
    { x: 74, y: 70, label: "Regulation" },
    { x: 40, y: 26, label: "Deprecation" },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md" aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {[46, 34, 22, 10].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgba(49,206,171,0.22)" strokeWidth="0.3" />
        ))}
        <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(49,206,171,0.15)" strokeWidth="0.3" />
        <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(49,206,171,0.15)" strokeWidth="0.3" />
        <g className="radar-sweep">
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(49,206,171,0)" />
              <stop offset="100%" stopColor="rgba(49,206,171,0.45)" />
            </linearGradient>
          </defs>
          <path d="M50 50 L50 4 A46 46 0 0 1 89.8 27 Z" fill="url(#sweep)" />
          <line x1="50" y1="50" x2="89.8" y2="27" stroke="#31ceab" strokeWidth="0.5" />
        </g>
      </svg>
      {blips.map((b) => (
        <div key={b.label} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${b.x}%`, top: `${b.y}%` }}>
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-radar-400 opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-3 rounded-full bg-radar-300" />
          </span>
          <span className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-ink-900/90 px-2 py-0.5 text-xs text-slate-200">
            {b.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function WorkspacePreview() {
  const rows = [
    { name: "Invoice exception triage", stage: "Production", platform: "Claude", value: "$412K / yr", w: "92%" },
    { name: "Sales call summarization", stage: "Pilot", platform: "Copilot", value: "$186K / yr", w: "71%" },
    { name: "Supplier risk monitoring", stage: "Building", platform: "OpenAI", value: "$240K / yr", w: "64%" },
    { name: "Maintenance knowledge assistant", stage: "Evaluating", platform: "Gemini", value: "$95K / yr", w: "48%" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60" aria-hidden>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Gauge className="size-4 text-radar-600" /> Acme Manufacturing · AI portfolio
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Active initiatives", "14"],
          ["Value delivered", "$1.2M"],
          ["Hours saved / yr", "18,400"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
            <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{r.name}</div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-radar-500" style={{ width: r.w }} />
              </div>
            </div>
            <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 sm:inline">{r.stage}</span>
            <span className="hidden rounded-md bg-radar-50 px-1.5 py-0.5 text-[11px] text-radar-800 sm:inline">{r.platform}</span>
            <span className="w-20 text-right text-xs font-medium text-slate-700 tabular-nums">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <Bell className="mt-0.5 size-3.5 shrink-0" />
        Radar alert: a pricing change from a vendor you use affects 2 initiatives.
      </div>
    </div>
  );
}
