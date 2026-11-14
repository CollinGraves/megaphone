import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  Building,
  Check,
  ChevronDown,
  ClipboardList,
  Database,
  Download,
  Hammer,
  Inbox,
  Lightbulb,
  Plug,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { WorkspacePreview } from "@/components/marketing/workspace-preview";
import { ButtonLink } from "@/components/ui";
import { BRAND, BRAND_COMPANY } from "@/lib/brand";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: `The ${BRAND} Workspace: one list for every AI project`,
  description:
    "Rank every AI project by value, effort and risk. Track hours and dollars saved, the data each one needs and approvals. Free for up to 5 AI projects.",
  alternates: { canonical: "/workspace" },
};

const START = `/sign-up?src=workspace_page&next=${encodeURIComponent("/workspaces/new")}`;

export default function WorkspaceProductPage() {
  return (
    <div>
      {/* 1. The promise */}
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(18,179,147,0.18),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-radar-300">{BRAND} Workspace</div>
            <h1 className="mt-2 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">One list for every AI project at your company.</h1>
            <p className="mt-5 max-w-lg text-lg text-slate-300">
              See what each AI project does, what it&apos;s worth, what data it needs and if it&apos;s approved. The list is ranked, so you know what to do
              next.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={START} variant="accent" size="lg">
                Start free <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink href="/contact?from=workspace_page" variant="secondary" size="lg">
                Talk to {BRAND_COMPANY}
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-slate-400">
              The Free plan covers up to {PLANS.free.initiativeLimit} AI projects. No card needed. Every plan lets you invite as many people as you like.
            </p>
          </div>
          <WorkspacePreview />
        </div>
      </section>

      {/* 2. The problem */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-slate-900">Most companies can&apos;t answer three simple questions about their AI.</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["What AI are we using?", "AI projects are spread across ChatGPT, Copilot, tools you built and someone's spreadsheet."],
              ["Is it paying off?", "Nobody counts the hours or dollars saved after the first test. So good projects look the same as bad ones."],
              ["Is it safe?", "No one knows which AI tools touch customer data, or who said yes to them."],
            ].map(([q, a]) => (
              <div key={q} className="rounded-xl bg-slate-50 p-5">
                <div className="font-semibold text-slate-900">{q}</div>
                <p className="mt-1 text-sm text-slate-600">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Feature deep dives, most important first */}
      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6 lg:space-y-28 lg:py-24">
        <Feature
          icon={<ClipboardList />}
          eyebrow="Pick what's next"
          title="Rank every AI project so you know what to do next"
          body="In the Workspace, you score each AI project from 1 to 5 on value, effort, fit and risk. You choose how much each one counts. The best projects rise to the top, and you can pin one that must go first."
          points={["Follow each project from idea to live", "Use your own scoring rules for every project", "Filter by stage, AI tool, team or department"]}
          visual={<ScoreVisual />}
        />
        <Feature
          flip
          icon={<TrendingUp />}
          eyebrow="Measure"
          title="See what each AI project is worth, in hours and dollars"
          body="Start with a guess of what an AI project will save. Each month, write down what really happened. The Workspace turns hours into dollars and adds up your costs, so you see what you get back for what you spend."
          points={["Hours saved, money saved, money made, or your own number", "Your guess next to what really happened, month by month", "Totals your leaders can read in one minute"]}
          visual={<ImpactVisual />}
        />
        <Feature
          icon={<Lightbulb />}
          eyebrow="Collect ideas"
          title="Get AI ideas from people across your company"
          body="People send AI ideas through the Workspace. They describe the task, how often it happens and how many hours it takes. You sort through the ideas and turn good ones into projects. Each person hears back."
          points={[
            "With the Team plan, share one link anyone at work can use, with no account",
            "Turn an idea into a project, say no with a reason, or mark it as a repeat",
            "With the Business plan, send each idea to the right department",
          ]}
          visual={<IdeaVisual />}
        />
        <Feature
          flip
          icon={<Hammer />}
          eyebrow="Build"
          title="Get a step-by-step plan to build any AI project"
          body="With one click, the Workspace writes a build plan for an AI project. It compares a few ways to build it and picks the best fit for the tools you already use. It lists the data you need, plus a prompt, tests and a to-do list."
          points={["Uses tools you already pay for when it can", "Download the plan, or send the to-do list to Jira", "AI coding tools can read the plan and report progress"]}
          visual={<BuildVisual />}
        />
        <Feature
          icon={<Database />}
          eyebrow="Unblock"
          title="See what data each AI project needs, and what's in the way"
          body="Keep a list of the systems your company uses, like Salesforce or SharePoint. For each AI project, note the data it uses, whether you have access and how private the data is. You'll spot problems before they slow a project down."
          points={["Access: not asked yet, asked, granted or blocked", "Privacy: internal, confidential, or personal, health or payment data", "See which systems the most projects depend on"]}
          visual={<DataVisual />}
        />
        <Feature
          flip
          icon={<ShieldCheck />}
          eyebrow="Stay safe"
          title="Approve AI projects and keep a record, without extra meetings"
          body="For each AI project, mark how risky it is and how closely a person checks its work. With the Business plan, you can require approval before a test or launch. Reviews come back on a schedule, with reminders."
          points={[
            "Say yes, yes with conditions, or no with a reason",
            "With the Business plan, download a list of every AI tool for auditors",
            "With the Business plan, department leads approve their own projects",
          ]}
          visual={<GovernanceVisual />}
        />
      </div>

      {/* 4. Smaller features */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Bell, title: "News alerts for your AI tools", body: "When news affects an AI tool you use, like a price change or a model shutting down, the Workspace flags each project that uses it." },
            { icon: Building, title: "Departments", body: "With the Business plan, Finance, Sales and other teams each get their own people, leads, AI projects, ideas and news." },
            { icon: Plug, title: "Ask Claude or ChatGPT", body: "With the Team plan, ask Claude, Cursor or ChatGPT about your AI projects. With the Business plan, add ideas and results from them too." },
            { icon: Download, title: "Your data stays yours", body: "With the Team plan or higher, download every AI project as a spreadsheet. The Workspace never connects to your company's systems." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="min-w-0">
              <Icon className="size-5 text-radar-600" aria-hidden />
              <div className="mt-3 font-semibold text-slate-900">{title}</div>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. How to start */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Set up the Workspace in an afternoon</h2>
        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {[
            ["Create your workspace", "It takes two minutes with your work email. Coworkers with the same email domain can ask to join."],
            ["Add your AI projects", "Start from ready-made examples, or turn ideas people send in into projects."],
            ["Invite your team", "Give each person a role: owner, admin, editor or viewer."],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-radar-50 text-sm font-semibold text-radar-700 ring-1 ring-radar-200">
                {i + 1}
              </span>
              <div>
                <div className="font-semibold text-slate-900">{title}</div>
                <p className="mt-1 text-sm text-slate-600">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 6. Plans */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">One price for your whole company, not for each person</h2>
            <Link href="/pricing" className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline">
              Compare every feature <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[PLANS.free, PLANS.team, PLANS.business].map((p) => (
              <div key={p.id} className="flex flex-col rounded-2xl border border-slate-200 p-6">
                <div className="font-semibold text-slate-900">{p.name} plan</div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {p.monthlyPrice ? `$${p.monthlyPrice}` : "$0"}
                  {p.monthlyPrice ? <span className="text-sm font-normal text-slate-500"> / month</span> : null}
                </div>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                  {p.highlights.slice(0, 5).map((h) => (
                    <li key={h} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-radar-600" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Done for you */}
      <section className="bg-ink-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <Sparkles className="size-5 text-radar-400" aria-hidden />
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Want {BRAND_COMPANY} to set up the Workspace for you?</h2>
            <p className="mt-2 text-slate-300">
              {BRAND_COMPANY}, the company behind {BRAND}, can meet with your leaders to list every AI project. We set up your workspace and help build
              the first projects. This help is optional, and the workspace stays yours.
            </p>
          </div>
          <ButtonLink href="/contact?from=workspace_page_services" variant="accent" size="lg" className="shrink-0">
            Talk to {BRAND_COMPANY}
          </ButtonLink>
        </div>
      </section>

      {/* 8. Questions */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Questions</h2>
        <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                {q}
                <ChevronDown className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-2 text-sm text-slate-600">{a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink href={START} size="lg">
            Start free <ArrowRight className="size-4" />
          </ButtonLink>
          <ButtonLink href="/assessment?src=workspace_page" variant="secondary" size="lg">
            Check how ready you are first
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}

const FAQ: [string, string][] = [
  ["Does the Workspace work with any AI tool?", "Yes. Track AI projects on any tool: ChatGPT, Copilot, Claude, Gemini, free open models or tools you built."],
  [
    "Does the Workspace connect to our systems or read our data?",
    "No. You write short notes about what each project uses. The Workspace keeps your notes, scores and numbers. It never stores your company's data.",
  ],
  [
    "How is this different from a spreadsheet or Jira?",
    "The Workspace does one job: it tracks AI projects. Scores, savings, data needs, approvals and AI news stay together and stay up to date. Your team can still build in Jira. Build plans send their to-do lists there.",
  ],
  [
    "Who can see what?",
    "Each person gets a role: owner, admin, editor or viewer. Each role can do different things. Department leads can do a little more in their own department.",
  ],
  ["Can we cancel a paid plan?", "Yes. Owners and admins can cancel any time in Plan & billing. Download your project list first if you want a copy."],
];

/* ─────────────────────────────── Layout ─────────────────────────────── */

function Feature({
  icon,
  eyebrow,
  title,
  body,
  points,
  visual,
  flip = false,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  visual: ReactNode;
  flip?: boolean;
}) {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={flip ? "min-w-0 lg:order-2" : "min-w-0"}>
        <div className="flex items-center gap-2 text-sm font-semibold text-radar-700 [&_svg]:size-4">
          {icon}
          {eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        <p className="mt-3 text-slate-600">{body}</p>
        <ul className="mt-5 space-y-2 text-sm text-slate-700">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-radar-600" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <div className={flip ? "min-w-0 lg:order-1" : "min-w-0"} aria-hidden>
        {visual}
      </div>
    </section>
  );
}

const Panel = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/60 ${className}`}>{children}</div>
);

/* ─────────────────────────────── Illustrations (example data) ─────────────────────────────── */

function ScoreVisual() {
  const factors = [
    ["Value", 5, "40%"],
    ["Ease", 4, "30%"],
    ["Fit", 4, "20%"],
    ["Risk", 3, "10%"],
  ] as const;
  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">Rank #1 of 14</div>
          <div className="mt-0.5 truncate font-semibold text-slate-900">Invoice error checker</div>
        </div>
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-radar-50 text-lg font-semibold text-radar-800 ring-4 ring-radar-200">86</div>
      </div>
      <div className="mt-5 space-y-3">
        {factors.map(([name, score, weight]) => (
          <div key={name} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm">
            <span className="text-slate-700">{name}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n} className={`h-2 flex-1 rounded-full ${n <= score ? "bg-radar-500" : "bg-slate-100"}`} />
              ))}
            </div>
            <span className="text-right text-xs text-slate-500 tabular-nums">{weight}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-800">Live</span>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">On track</span>
        <span className="rounded-md bg-radar-50 px-1.5 py-0.5 text-radar-800">Claude</span>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">Finance</span>
      </div>
    </Panel>
  );
}

function ImpactVisual() {
  const months = [
    ["Jun", 60, 0],
    ["Jul", 60, 38],
    ["Aug", 60, 52],
    ["Sep", 60, 64],
    ["Oct", 60, 71],
    ["Nov", 60, 74],
  ] as const;
  return (
    <Panel>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Hours saved / yr", "3,550"],
          ["Value / yr", "$412K"],
          ["Return on cost", "4.1×"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-lg bg-slate-50 p-3">
            <div className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">{k}</div>
            <div className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex h-32 items-end gap-3">
        {months.map(([m, est, act]) => (
          <div key={m} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex h-24 w-full items-end justify-center gap-1">
              <span className="w-2.5 rounded-t bg-slate-200" style={{ height: `${est}%` }} />
              <span className="w-2.5 rounded-t bg-radar-500" style={{ height: `${act}%` }} />
            </div>
            <span className="text-[10px] text-slate-500">{m}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-slate-200" /> Our guess
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-radar-500" /> Real hours saved
        </span>
      </div>
    </Panel>
  );
}

function IdeaVisual() {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_0.9fr]">
      <Panel className="p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Inbox className="size-3.5" /> New idea from the idea link
        </div>
        <div className="mt-2 font-semibold text-slate-900">Draft replies to warranty claims</div>
        <p className="mt-1 text-sm text-slate-600">We answer about 40 a day by hand. Most need the same three documents.</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">Daily</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">6 people</span>
          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800">≈ 1,900 hrs / yr</span>
        </div>
      </Panel>
      <Panel className="space-y-2 p-4 text-sm">
        <div className="text-xs font-medium text-slate-500">What to do with it</div>
        <div className="rounded-lg bg-radar-600 px-3 py-2 text-center font-medium text-white">Make it a project</div>
        <div className="rounded-lg border border-slate-200 px-3 py-2 text-center text-slate-700">Mark as a repeat</div>
        <div className="rounded-lg border border-slate-200 px-3 py-2 text-center text-slate-700">Say no, with a reason</div>
      </Panel>
    </div>
  );
}

function BuildVisual() {
  return (
    <Panel>
      <div className="text-xs text-slate-500">Build plan · v2</div>
      <div className="mt-2 rounded-xl border border-radar-300 bg-radar-50/50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-radar-700">Best fit</div>
        <div className="mt-1 font-semibold text-slate-900">Copilot Studio agent</div>
        <div className="text-xs text-slate-500">Uses Microsoft 365 you already have · Small (days)</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-slate-200 p-2.5 text-slate-600">Power Automate + API · Medium</div>
        <div className="rounded-lg border border-slate-200 p-2.5 text-slate-600">Custom service · Large</div>
      </div>
      <ol className="mt-4 space-y-1.5 text-sm">
        {["Confirm scope and success metrics", "Set up read access to the claims inbox", "Build the first version", "Run the test cases"].map((t, i) => (
          <li key={t} className="flex items-center gap-2 text-slate-700">
            <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function DataVisual() {
  const rows = [
    ["Salesforce", "Accounts and case history", "Granted", "Personal"],
    ["SharePoint", "Policy documents", "Granted", "Internal"],
    ["NetSuite", "Open invoices", "Asked", "Confidential"],
    ["Claims inbox", "Customer emails", "Blocked", "Personal"],
  ];
  const tone: Record<string, string> = {
    Granted: "bg-emerald-50 text-emerald-800",
    Asked: "bg-amber-50 text-amber-800",
    Blocked: "bg-red-50 text-red-700",
  };
  return (
    <Panel className="p-0">
      <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">Data this project needs</div>
      <ul className="divide-y divide-slate-100">
        {rows.map(([sys, data, access, sens]) => (
          <li key={sys} className="flex items-center gap-3 px-5 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">{sys}</div>
              <div className="truncate text-xs text-slate-500">{data}</div>
            </div>
            <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 sm:inline">{sens}</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${tone[access]}`}>{access}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function GovernanceVisual() {
  const rows = [
    ["Invoice error checker", "Some", "Approved", "bg-emerald-50 text-emerald-800"],
    ["Candidate screening notes", "High", "Waiting for review", "bg-amber-50 text-amber-800"],
    ["Sales call summaries", "Low", "Approved", "bg-emerald-50 text-emerald-800"],
  ];
  return (
    <Panel className="p-0">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <span className="text-sm font-semibold text-slate-900">Every AI tool you use</span>
        <span className="inline-flex items-center gap-1 text-xs text-radar-700">
          <Download className="size-3.5" /> CSV
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map(([name, tier, status, tone]) => (
          <li key={name} className="flex items-center gap-3 px-5 py-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{name}</span>
            <span className="hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 sm:inline">{tier} risk</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${tone}`}>{status}</span>
          </li>
        ))}
      </ul>
      <div className="m-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Rule: approve before going live. Review again every 12 months.
      </div>
    </Panel>
  );
}
