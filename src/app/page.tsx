import Link from "next/link";
import { and, count, countDistinct, desc, eq, gte, isNotNull } from "drizzle-orm";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  Cpu,
  Database,
  Gauge,
  Landmark,
  Layers,
  ListOrdered,
  Radar,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { EmailCapture } from "@/components/email-capture";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { StoryCard } from "@/components/stories/story-card";
import { ButtonLink } from "@/components/ui";
import { db } from "@/db";
import { sources, stories, user, type Story } from "@/db/schema";
import { listStories } from "@/lib/stories";
import { CATEGORIES, categoryLabel, vendorLabel } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Only show reader counts once they're large enough to be persuasive. */
const SOCIAL_PROOF_MIN_READERS = 250;

async function getStats() {
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [[s], [st], [readers], firstParty] = await Promise.all([
    db.select({ n: count() }).from(sources).where(eq(sources.active, true)),
    db.select({ n: count() }).from(stories).where(and(eq(stories.status, "published"), gte(stories.publishedAt, weekAgo))),
    db
      .select({ n: count(), companies: countDistinct(user.companyDomain) })
      .from(user)
      .where(and(isNotNull(user.onboardedAt), eq(user.platformRole, "user"))),
    db
      .select({ name: sources.name })
      .from(sources)
      .where(and(eq(sources.active, true), gte(sources.authority, 4)))
      .orderBy(desc(sources.authority), sources.name)
      .limit(18),
  ]);
  return {
    sources: s?.n ?? 0,
    storiesThisWeek: st?.n ?? 0,
    readers: readers?.n ?? 0,
    companies: readers?.companies ?? 0,
    sourceNames: firstParty.map((f) => f.name),
  };
}

export default async function HomePage() {
  const [top, stats] = await Promise.all([listStories({ sinceDays: 7, order: "top", limit: 6 }), getStats()]);
  const showReaders = stats.readers >= SOCIAL_PROOF_MIN_READERS;

  return (
    <>
      <SiteHeader dark />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-ink-950 text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(18,179,147,0.18),transparent_55%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-radar-300">
                <span className="size-1.5 rounded-full bg-radar-400" />
                {showReaders
                  ? `Read by ${formatNumber(stats.readers)} professionals at ${formatNumber(stats.companies)} companies`
                  : `Tracking ${formatNumber(stats.sources)} sources · ${formatNumber(stats.storiesThisWeek)} stories this week`}
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                The AI briefing for people who run the business.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-300">
                Model launches, price changes, deprecations and regulation, filtered to your industry and the platforms your
                company runs on. One short digest, with what happened and why it matters.
              </p>
              <EmailCapture source="hero" dark className="mt-8" />
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                <Link href="/radar" className="underline-offset-4 hover:text-white hover:underline">
                  Browse this week&apos;s top stories →
                </Link>
                <span className="hidden sm:inline" aria-hidden>
                  ·
                </span>
                <span>Built by North Labs, AI consultants to operating teams</span>
              </div>
            </div>
            <RadarVisual />
          </div>
        </section>

        {/* Sources strip */}
        <section className="border-b border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Watching first-party and top-tier sources, including</div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-slate-600">
              {stats.sourceNames.map((n) => (
                <span key={n}>{n}</span>
              ))}
              <span className="text-slate-400">+ {Math.max(0, stats.sources - stats.sourceNames.length)} more</span>
            </div>
          </div>
        </section>

        {/* Digest preview */}
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Five minutes a week. Nothing important missed.</h2>
              <p className="mt-3 text-slate-600">
                Forty articles about the same launch become one story, with a plain-English summary and a note on what it means
                for companies adopting AI. You choose the topics, vendors and industries; we send what matters, daily or weekly.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {[
                  "Ranked by significance, not by who published first",
                  "Every story links to the original sources",
                  "Vendor-neutral: no pay-to-play rankings",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-radar-600" /> {t}
                  </li>
                ))}
              </ul>
            </div>
            <DigestPreview stories={top.slice(0, 3)} />
          </div>
        </section>

        {/* Roles */}
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Built for the leaders accountable for AI results</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Cpu, role: "CIOs & CTOs", body: "Vendor roadmaps, deprecations and security issues for the platforms you've standardized on." },
                { icon: BriefcaseBusiness, role: "COOs & operations", body: "Where AI is actually saving time in operations like yours, and what it took to get there." },
                { icon: Sparkles, role: "Heads of AI & data", body: "Model releases, agent tooling and price/performance shifts that change what's worth building." },
                { icon: Landmark, role: "Finance, legal & risk", body: "Regulation, pricing changes and governance frameworks, before they hit your budget or audit." },
              ].map(({ icon: Icon, role, body }) => (
                <div key={role} className="rounded-xl border border-slate-200 p-5">
                  <Icon className="size-5 text-radar-600" />
                  <h3 className="mt-3 font-semibold text-slate-900">{role}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              ))}
            </div>
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
            {top.slice(0, 3).map((s) => (
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
                { icon: Layers, title: "We separate signal from noise", body: "Duplicate coverage is merged into one story. Each story is summarized, tagged and scored for significance." },
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

        {/* FAQ */}
        <section className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Questions</h2>
            <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                    {f.q}
                    <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-ink-900">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold text-white">Stop scrolling ten feeds to keep up with AI.</h2>
              <p className="mt-1 text-slate-300">Set up your radar in 30 seconds. Free.</p>
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
    q: "Is AI Radar really free?",
    a: "Yes. The feed and digest are free. North Labs funds it because it's how we stay close to what our clients need, and some readers eventually ask us for help with their own AI initiatives.",
  },
  {
    q: "Why do you ask for my work email?",
    a: "Your company tells us your industry and likely tech stack, so we can rank the stories that matter to you, and it lets colleagues share your radar. We never sell your information. North Labs may occasionally reach out if it looks like we could help, and you can opt out anytime.",
  },
  {
    q: "How is this different from other AI newsletters?",
    a: "It's personalized and business-focused. Instead of one editor's picks for everyone, AI Radar ranks every story by significance and filters it to your topics, vendors and industry, with a note on why it matters for companies adopting AI.",
  },
  {
    q: "How often will I hear from you?",
    a: "You choose: a daily briefing on weekday mornings, a weekly digest on Mondays, or no email at all, just the feed. You can change it anytime.",
  },
  {
    q: "Who is North Labs?",
    a: "North Labs is an AI consultancy that helps companies decide where AI should go first, build it on the right platform, and measure the impact. Our clients run their AI portfolios in the AI Radar Workspace.",
  },
];

function DigestPreview({ stories }: { stories: Story[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60" aria-label="Example digest">
      <div className="flex items-center justify-between rounded-t-2xl bg-ink-900 px-5 py-3 text-sm">
        <span className="font-semibold text-white">
          AI Radar <span className="font-normal text-slate-400">· Weekly digest</span>
        </span>
        <span className="text-xs text-slate-400">Monday, 8:00 AM</span>
      </div>
      <div className="divide-y divide-slate-100 px-5">
        {stories.map((s) => (
          <div key={s.id} className="py-4">
            <div className="text-xs text-slate-500">
              {[s.primarySourceName, ...s.vendors.slice(0, 1).map(vendorLabel), ...s.categories.slice(0, 1).map(categoryLabel)].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-1 font-semibold leading-snug text-slate-900">{s.title}</div>
            {s.summary.trim() !== s.title.trim() ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{s.summary}</p> : null}
            {s.whyItMatters ? (
              <p className="mt-2 border-l-2 border-radar-400 pl-2.5 text-xs text-slate-700">
                <strong>Why it matters:</strong> {s.whyItMatters}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
        <Building2 className="size-3.5" /> Filtered for: Manufacturing · Microsoft · Pricing changes · Regulation
      </div>
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
        <Gauge className="size-4 text-radar-600" /> Example company · AI portfolio
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
