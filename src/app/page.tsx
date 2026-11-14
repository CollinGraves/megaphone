import Link from "next/link";
import { and, count, eq, gte } from "drizzle-orm";
import { ArrowRight, ChevronDown, ClipboardList, Gauge, Hammer, Mic, ShieldCheck, TrendingUp } from "lucide-react";
import { EmailCapture } from "@/components/email-capture";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui";
import { db } from "@/db";
import { sources, stories, type Story } from "@/db/schema";
import { PLANS } from "@/lib/plans";
import { listStories } from "@/lib/stories";
import { vendorLabel } from "@/lib/taxonomy";
import { formatNumber, timeAgo } from "@/lib/utils";
import { BRAND, SHOW_NAME } from "@/lib/brand";
import { WorkspacePreview } from "@/components/marketing/workspace-preview";
import { ScoreRing } from "./(public)/assessment/_components/visuals";

export const dynamic = "force-dynamic";

async function getStats() {
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [[s], [st], named] = await Promise.all([
    db.select({ n: count() }).from(sources).where(eq(sources.active, true)),
    db.select({ n: count() }).from(stories).where(and(eq(stories.status, "published"), gte(stories.publishedAt, weekAgo))),
    db
      .select({ name: sources.name })
      .from(sources)
      .where(and(eq(sources.active, true), gte(sources.authority, 5)))
      .orderBy(sources.name)
      .limit(8),
  ]);
  return { sources: s?.n ?? 0, storiesThisWeek: st?.n ?? 0, sourceNames: named.map((n) => n.name) };
}

export default async function HomePage() {
  const [top, stats] = await Promise.all([listStories({ sinceDays: 7, order: "top", limit: 4 }), getStats()]);

  return (
    <>
      <SiteHeader dark />
      <main className="flex-1">
        {/* 1. Promise, sign-up and live proof */}
        <section className="relative overflow-hidden bg-ink-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(18,179,147,0.18),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-20">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">AI news that affects your company. Nothing else.</h1>
              <p className="mt-5 max-w-lg text-lg text-slate-300">
                Every hour, we read {stats.sources > 0 ? formatNumber(stats.sources) : "dozens of"} AI news sources. We send you only the stories
                that matter to your company and the tools you use.
              </p>
              <EmailCapture source="hero" dark className="mt-8" />
              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400">
                <Link href="/assessment?src=home_hero" className="inline-flex items-center gap-1.5 hover:text-white">
                  <Gauge className="size-4 text-radar-300" aria-hidden /> Free AI readiness score
                </Link>
                <Link href="/show" className="inline-flex items-center gap-1.5 hover:text-white">
                  <Mic className="size-4 text-radar-300" aria-hidden /> Watch the show
                </Link>
              </div>
            </div>
            {top.length ? <ThisWeek stories={top} total={stats.storiesThisWeek} /> : <RadarVisual />}
          </div>
        </section>

        {/* 2. Where it comes from */}
        {stats.sourceNames.length ? (
          <section className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-sm text-slate-500 sm:px-6">
              <span className="font-medium text-slate-700">Sources include</span>
              {stats.sourceNames.map((n) => (
                <span key={n}>{n}</span>
              ))}
              {stats.sources > stats.sourceNames.length ? <span className="text-slate-400">and {stats.sources - stats.sourceNames.length} more</span> : null}
            </div>
          </section>
        ) : null}

        {/* 3. The paid product */}
        <section id="workspace" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-16 sm:px-6 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-radar-700">For companies</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Track every AI project in one place</h2>
              <p className="mt-3 max-w-lg text-slate-600">
                Most companies use AI in many places, like ChatGPT, Copilot, Claude and tools they built. The {BRAND} Workspace puts every AI
                project in one list. You see what each one does, what it&apos;s worth and what&apos;s holding it up.
              </p>
              <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                {[
                  { icon: ClipboardList, title: "Know what to do next", body: "Score each project on value, effort and risk. The best ones rise to the top." },
                  { icon: TrendingUp, title: "See what it's worth", body: "Track the hours and money each project saves, month by month." },
                  { icon: Hammer, title: "Get a plan to build it", body: "For any idea, get the steps, the data it needs and a to-do list." },
                  { icon: ShieldCheck, title: "Keep AI safe", body: "Mark how risky each project is. Approve it before it goes live." },
                ].map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-radar-600" aria-hidden />
                    <div>
                      <div className="font-medium text-slate-900">{title}</div>
                      <div className="text-sm text-slate-600">{body}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href={`/sign-up?src=landing_workspace&next=${encodeURIComponent("/workspaces/new")}`} size="lg">
                  Start free
                </ButtonLink>
                <ButtonLink href="/workspace" variant="secondary" size="lg">
                  See how it works <ArrowRight className="size-4" />
                </ButtonLink>
              </div>
            </div>
            <WorkspacePreview />
          </div>
        </section>

        {/* 4. Two free ways in */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
            <Link href="/assessment?src=home_section" className="group flex min-w-0 items-center gap-5 rounded-2xl border border-slate-200 p-6 transition-colors hover:border-radar-400">
              <ScoreRing score={61} size={88} />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">How ready is your company for AI?</h2>
                <p className="mt-1 text-sm text-slate-600">Answer 16 quick questions. Get a score, see where you&apos;re weakest and learn where to start. No sign-up needed.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-radar-700 group-hover:underline">
                  Take the assessment <ArrowRight className="size-4" aria-hidden />
                </span>
              </div>
            </Link>
            <Link href="/show" className="group flex min-w-0 items-center gap-5 rounded-2xl border border-slate-200 p-6 transition-colors hover:border-radar-400">
              <div className="flex size-[88px] shrink-0 items-center justify-center rounded-full bg-ink-950 text-radar-300">
                <Mic className="size-9" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">{SHOW_NAME}</h2>
                <p className="mt-1 text-sm text-slate-600">A video show about the week&apos;s AI news for people who run companies. In each episode, we build a viewer&apos;s idea live.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-radar-700 group-hover:underline">
                  Watch episodes <ArrowRight className="size-4" aria-hidden />
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* 5. Pricing teaser */}
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">The news radar is free. The Workspace starts free too.</h2>
            <Link href="/pricing" className="text-sm font-medium text-radar-700 hover:underline">
              Compare plans →
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[PLANS.free, PLANS.team, PLANS.business].map((p) => (
              <div key={p.name} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="font-semibold text-slate-900">{p.name} plan</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                  {p.monthlyPrice ? `$${formatNumber(p.monthlyPrice)}` : "$0"}
                  <span className="text-sm font-normal text-slate-500">{p.monthlyPrice ? " / month" : ""}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{p.tagline}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Want help? North Labs, the company behind {BRAND}, can set up and run your workspace with you.{" "}
            <Link href="/contact?from=home_pricing" className="text-radar-700 hover:underline">
              Talk to us
            </Link>
            .
          </p>
        </section>

        {/* 6. Questions */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
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

        {/* 7. Last call */}
        <section className="bg-ink-900">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-white">Get AI news that matters to you.</h2>
              <p className="mt-1 text-slate-300">It takes 30 seconds, and it&apos;s free.</p>
            </div>
            <EmailCapture source="footer_cta" dark />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

const FAQ = [
  {
    q: `Is ${BRAND} free?`,
    a: "The news radar and the email digest are free. The Workspace has a Free plan, plus paid plans for bigger teams. North Labs, an AI consulting company, pays for the free part. It keeps us close to what companies need.",
  },
  {
    q: "Why a work email?",
    a: "Your work email tells us where you work. From that, we can guess which AI tools your company uses. Then we warn you about news that affects them, like a tool shutting down. You can fix the list. We don't sell your data.",
  },
  {
    q: "How often will you email me?",
    a: "Every weekday morning, once a week on Mondays, or never. You can change it any time.",
  },
  {
    q: "Who is North Labs?",
    a: `An AI consulting company for mid-size businesses. We help companies pick what to build first, build it and measure the results. Our clients track their AI work in ${BRAND}.`,
  },
];

function ThisWeek({ stories, total }: { stories: Story[]; total: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur">
      <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs text-slate-400">
        <span className="font-medium uppercase tracking-wide text-radar-300">This week on the radar</span>
        {total ? <span>{formatNumber(total)} stories</span> : null}
      </div>
      <ul>
        {stories.map((s) => (
          <li key={s.id}>
            <Link href={`/radar/${s.slug}`} className="block rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.06]">
              <div className="text-xs text-slate-400">
                {[s.primarySourceName, s.vendors[0] ? vendorLabel(s.vendors[0]) : null, timeAgo(s.publishedAt)].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-0.5 font-medium leading-snug text-white">{s.title}</div>
              {s.whyItMatters ? <p className="mt-1 line-clamp-2 text-sm text-slate-400">{s.whyItMatters}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/radar" className="block px-3 pt-1 pb-2 text-sm font-medium text-radar-300 hover:text-radar-200">
        All top stories →
      </Link>
    </div>
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
    <div className="relative mx-auto hidden aspect-square w-full max-w-md sm:block" aria-hidden>
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
