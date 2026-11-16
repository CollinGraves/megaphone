import Link from "next/link";
import { and, count, eq, gte } from "drizzle-orm";
import { ArrowRight, Bell, ChevronDown, ClipboardList, ClipboardPaste, Database, FileText, Hammer, Lightbulb, Mic, ShieldCheck, TrendingUp } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { ButtonLink } from "@/components/ui";
import { db } from "@/db";
import { sources, stories, type Story } from "@/db/schema";
import { PLANS } from "@/lib/plans";
import { listStories } from "@/lib/stories";
import { vendorLabel } from "@/lib/taxonomy";
import { formatNumber, timeAgo } from "@/lib/utils";
import { BRAND, SHOW_NAME } from "@/lib/brand";
import { startFreeHref } from "@/lib/marketing";
import { WorkspacePreview } from "@/components/marketing/workspace-preview";
import { ScoreRing } from "./(public)/assessment/_components/visuals";

export const dynamic = "force-dynamic";

async function getStats() {
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [[s], [st]] = await Promise.all([
    db.select({ n: count() }).from(sources).where(eq(sources.active, true)),
    db.select({ n: count() }).from(stories).where(and(eq(stories.status, "published"), gte(stories.publishedAt, weekAgo))),
  ]);
  return { sources: s?.n ?? 0, storiesThisWeek: st?.n ?? 0 };
}

const TRACK = [
  { icon: ClipboardList, title: "Every AI project", body: "What it does, who owns it, which team uses it, which AI tools it runs on and how far along it is." },
  { icon: ShieldCheck, title: "Risk and approvals", body: "Mark how risky each project is. Approve it before it goes live, and get reminded when a review is due." },
  { icon: TrendingUp, title: "What it's worth", body: "Record the hours and money each project saves, month by month. See which ones pay off." },
  { icon: Database, title: "The data it needs", body: "See which systems each project needs, and where getting access is holding it up." },
  { icon: Lightbulb, title: "Ideas from everyone", body: "Anyone at your company can send an AI idea. Your team sorts them and turns the best into projects." },
  { icon: Hammer, title: "A plan to build it", body: "For any project, get the steps, the data plan and a to-do list your team or a partner can build from." },
];

export default async function HomePage() {
  const [top, stats] = await Promise.all([listStories({ sinceDays: 7, order: "top", limit: 4 }), getStats()]);

  return (
    <>
      <SiteHeader dark />
      <main className="flex-1">
        {/* 1. The promise */}
        <section className="relative overflow-hidden bg-ink-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(18,179,147,0.18),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_1fr] lg:py-20">
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">Track every AI project at your company.</h1>
              <p className="mt-5 max-w-lg text-lg text-slate-300">
                See what&apos;s being built, who owns it, how risky it is, whether it&apos;s approved and what it&apos;s worth. All in one place.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href={startFreeHref("home_hero")} variant="accent" size="lg">
                  Start free
                </ButtonLink>
                <ButtonLink href="/workspace" variant="secondary" size="lg">
                  See how it works <ArrowRight className="size-4" />
                </ButtonLink>
              </div>
              <p className="mt-4 text-sm text-slate-400">Free for up to {PLANS.free.initiativeLimit} AI projects. No card needed.</p>
            </div>
            <WorkspacePreview />
          </div>
        </section>

        {/* 2. What you track */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Everything about your AI work, in one list</h2>
            <p className="mt-3 text-slate-600">
              Most companies use AI in lots of places: ChatGPT, Copilot, Claude and tools they built themselves. {BRAND} keeps track of all of it, so
              nothing gets lost and nothing goes live without a look.
            </p>
          </div>
          <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {TRACK.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-radar-600" aria-hidden />
                <div>
                  <div className="font-medium text-slate-900">{title}</div>
                  <div className="mt-1 text-sm text-slate-600">{body}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 3. Monthly update for leadership */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-radar-700">
                <FileText className="size-4" aria-hidden /> Monthly update
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">A one-page update for your leaders, every month</h2>
              <p className="mt-3 max-w-lg text-slate-600">
                On the 1st of each month, {BRAND} emails your owners and admins a short update. What went live, what moved forward, what&apos;s stuck,
                what needs approval and how much time and money AI saved. No slides to build.
              </p>
            </div>
            <MonthlyUpdatePreview />
          </div>
        </section>

        {/* 4. Vendor alerts (the news, as a feature) */}
        <section className="bg-ink-950 text-white">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-radar-300">
                <Bell className="size-4" aria-hidden /> Vendor alerts
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Know when an AI tool you rely on changes</h2>
              <p className="mt-3 max-w-lg text-slate-300">
                Every hour, {BRAND} reads {stats.sources > 0 ? formatNumber(stats.sources) : "dozens of"} AI news sources. When a price change,
                shutdown, security problem or new law affects a tool one of your projects uses, that project gets an alert.
              </p>
              <Link href="/news" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-radar-300 hover:text-radar-200">
                Read this week&apos;s AI news <ArrowRight className="size-4" aria-hidden />
              </Link>
            </div>
            {top.length ? <ThisWeek stories={top} total={stats.storiesThisWeek} /> : null}
          </div>
        </section>

        {/* 5. Start with the list you have */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-radar-700">
                <ClipboardPaste className="size-4" aria-hidden /> Get set up in minutes
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Start with the list you already have</h2>
              <p className="mt-3 max-w-lg text-slate-600">
                Paste rows from a spreadsheet, meeting notes or a bullet list. {BRAND} turns each one into an AI project with its team, tools and stage
                filled in. You check them before anything is saved.
              </p>
            </div>
            <ImportPreview />
          </div>
        </section>

        {/* 6. Pricing teaser */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Start free. Upgrade when you need more.</h2>
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
              Want help? North Labs, the company behind {BRAND}, can set it up and run it with you.{" "}
              <Link href="/contact?from=home_pricing" className="text-radar-700 hover:underline">
                Talk to us
              </Link>
              .
            </p>
          </div>
        </section>

        {/* 7. Two free ways in */}
        <section className="border-t border-slate-200">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2">
            <Link href="/assessment?src=home_section" className="group flex min-w-0 items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-radar-400">
              <ScoreRing score={61} size={88} />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">How ready is your company for AI?</h2>
                <p className="mt-1 text-sm text-slate-600">Answer 16 quick questions. Get a score, see where you&apos;re weakest and learn where to start. No sign-up needed.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-radar-700 group-hover:underline">
                  Take the assessment <ArrowRight className="size-4" aria-hidden />
                </span>
              </div>
            </Link>
            <Link href="/show" className="group flex min-w-0 items-center gap-5 rounded-2xl border border-slate-200 bg-white p-6 transition-colors hover:border-radar-400">
              <div className="flex size-[88px] shrink-0 items-center justify-center rounded-full bg-ink-950 text-radar-300">
                <Mic className="size-9" aria-hidden />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">{SHOW_NAME}</h2>
                <p className="mt-1 text-sm text-slate-600">A weekly show. Send in your AI question, and we answer it on air. Sometimes we build your idea live.</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-radar-700 group-hover:underline">
                  Watch episodes <ArrowRight className="size-4" aria-hidden />
                </span>
              </div>
            </Link>
          </div>
        </section>

        {/* 8. Questions */}
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

        {/* 9. Last call */}
        <section className="bg-ink-900">
          <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-white">Start tracking your AI projects today.</h2>
              <p className="mt-1 text-slate-300">Free for up to {PLANS.free.initiativeLimit} AI projects. Set up takes a few minutes.</p>
            </div>
            <ButtonLink href={startFreeHref("home_footer")} variant="accent" size="lg">
              Start free
            </ButtonLink>
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
    a: `The Free plan is free for up to ${PLANS.free.initiativeLimit} AI projects, with no card needed. The Team and Business plans are for bigger teams. North Labs, an AI consulting company, builds ${BRAND}.`,
  },
  {
    q: `Does ${BRAND} connect to our systems or read our data?`,
    a: `No. ${BRAND} keeps your notes, scores and numbers about each AI project. It never connects to your company's systems or reads your files.`,
  },
  {
    q: `Does ${BRAND} work with any AI tool?`,
    a: "Yes. Track projects built on ChatGPT, Copilot, Claude, Gemini, open models or anything else. Alerts cover all the big AI vendors.",
  },
  {
    q: "Who is North Labs?",
    a: `An AI consulting company for mid-size businesses. We help companies pick what to build first, build it and measure the results. Our clients track their AI work in ${BRAND}.`,
  },
];

function MonthlyUpdatePreview() {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60" aria-hidden>
      <div className="text-xs text-slate-500">Example company · October update</div>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">
        In October, 2 AI projects went live and 3 moved forward. Projects saved about 2,100 hours. 1 project is waiting for approval.
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ["AI projects", "14"],
          ["Live", "5"],
          ["Hours saved", "2,100"],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-slate-50 p-3">
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5 text-sm">
        <div className="font-medium text-slate-900">Went live</div>
        <div className="text-slate-600">Invoice error checker · Sales call summaries</div>
        <div className="pt-1 font-medium text-slate-900">Waiting for approval</div>
        <div className="text-slate-600">Supplier risk monitoring</div>
      </div>
    </div>
  );
}

function ImportPreview() {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2" aria-hidden>
      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs leading-relaxed text-slate-600">
        <div className="mb-2 font-sans text-[10px] font-medium uppercase tracking-wide text-slate-400">You paste</div>
        - Invoice triage, Finance, trying ChatGPT
        <br />- Sales call notes w/ Copilot (live)
        <br />- HR policy chatbot idea
      </div>
      <div className="min-w-0 space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{BRAND} sorts it</div>
        {[
          ["Invoice triage", "Finance · OpenAI", "Testing"],
          ["Sales call notes", "Sales · Microsoft", "Live"],
          ["HR policy chatbot", "HR", "Idea"],
        ].map(([t, meta, stage]) => (
          <div key={t} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-900">{t}</div>
              <div className="truncate text-xs text-slate-500">{meta}</div>
            </div>
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThisWeek({ stories, total }: { stories: Story[]; total: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-2 backdrop-blur">
      <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs text-slate-400">
        <span className="font-medium uppercase tracking-wide text-radar-300">This week in AI news</span>
        {total ? <span>{formatNumber(total)} stories</span> : null}
      </div>
      <ul>
        {stories.map((s) => (
          <li key={s.id}>
            <Link href={`/news/${s.slug}`} className="block rounded-xl px-3 py-3 transition-colors hover:bg-white/[0.06]">
              <div className="text-xs text-slate-400">
                {[s.primarySourceName, s.vendors[0] ? vendorLabel(s.vendors[0]) : null, timeAgo(s.publishedAt)].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-0.5 font-medium leading-snug text-white">{s.title}</div>
              {s.whyItMatters ? <p className="mt-1 line-clamp-2 text-sm text-slate-400">{s.whyItMatters}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

