import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Clock, Lightbulb, Rocket, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui";
import { monthLabel, previousMonth, reportToText, templateSummary, type ReportData } from "@/lib/report/build";
import { getOrCreateReport, loadReportData, reportUrl } from "@/lib/report/server";
import { formatUsd } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { CopyButton } from "../_components/client";

export const metadata: Metadata = { title: "Monthly update" };
// Writing a month's summary with AI can take a few seconds the first time.
export const maxDuration = 60;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function ReportPage({ params, searchParams }: PageProps<"/w/[slug]/report">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  const now = new Date();
  const current = now.toISOString().slice(0, 7);
  const requested = typeof sp.month === "string" && MONTH_RE.test(sp.month) && sp.month <= current ? sp.month : previousMonth(now);
  const createdMonth = ctx.org.createdAt.toISOString().slice(0, 7);
  const month = requested < createdMonth ? createdMonth : requested;
  const isCurrent = month === current;

  // Finished months are saved once (so the email and this page match); this month is live.
  let data: ReportData;
  let summary: string;
  if (isCurrent) {
    data = await loadReportData(ctx.org, month);
    summary = templateSummary(data, ctx.org.name, { soFar: true });
  } else {
    const saved = await getOrCreateReport(ctx.org, month);
    data = saved.data as unknown as ReportData;
    summary = saved.summary;
  }
  const months: string[] = [];
  for (let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); months.length < 12; d.setUTCMonth(d.getUTCMonth() - 1)) {
    const m = d.toISOString().slice(0, 7);
    if (m < createdMonth) break;
    months.push(m);
  }
  const base = `/w/${ctx.org.slug}`;
  const value = data.totals.actualRunRateUsd || data.totals.estimatedAnnualUsd;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monthly update"
        title={`${isCurrent ? "So far in" : "AI update for"} ${monthLabel(month)}`}
        description={
          isCurrent
            ? "This month so far. The full update is saved and emailed to owners and admins on the 1st."
            : "A one-page update for leadership. Owners and admins get it by email on the 1st of each month."
        }
        actions={<CopyButton value={reportToText(data, ctx.org.name, summary, reportUrl(ctx.org.slug, month))} label="Copy as text" />}
      />

      <nav aria-label="Months" className="-mt-2 flex gap-2 overflow-x-auto pb-1">
        {months.map((m) => (
          <Link
            key={m}
            href={`${base}/report?month=${m}`}
            aria-current={m === month ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1 text-sm ${m === month ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900"}`}
          >
            {m === current ? "This month" : monthLabel(m)}
          </Link>
        ))}
      </nav>

      <Card>
        <CardBody>
          <p className="text-[15px] leading-relaxed text-slate-800">{summary}</p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="AI projects" value={String(data.totals.projects)} hint={`${data.totals.live} live, ${data.totals.testing} testing`} />
        <Stat label="Value per year" value={formatUsd(value)} hint={data.totals.actualRunRateUsd ? "From real results" : "Estimated"} />
        <Stat label={isCurrent ? "Hours saved this month" : "Hours saved that month"} value={Math.round(data.monthActuals.hours).toLocaleString("en-US")} hint={`${data.monthActuals.projects} projects reported`} />
        <Stat label="New ideas" value={String(data.ideas.new)} hint={`${data.ideas.open} waiting to be sorted`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section icon={<Rocket className="text-radar-600" />} title="Went live" empty="Nothing went live." rows={data.launched} />
        <Section icon={<ArrowUpRight className="text-sky-600" />} title="Moved forward" empty="No other stage changes." rows={data.movedForward.map((m) => `${m.title} (now ${m.to})`)} />
        <Section icon={<AlertTriangle className="text-red-600" />} title="Blocked" empty="Nothing is blocked." rows={data.blocked.map((b) => `${b.title}: ${b.reason}`)} />
        <Section icon={<ShieldCheck className="text-amber-600" />} title="Waiting for approval" empty="No approvals waiting." rows={data.awaitingApproval} />
        <Section
          icon={<Clock className="text-slate-500" />}
          title="Live, but no results recorded"
          empty="Every live project with a goal has results recorded."
          rows={data.needsActuals}
          note="Record how many hours or dollars each one saved, so the value above stays real."
        />
        <Section icon={<Lightbulb className="text-amber-500" />} title="New this month" empty="No new AI projects." rows={data.added} />
      </div>

      <Card>
        <CardHeader title="Top 5 AI projects" description="Ranked by your priority score." />
        <ol className="divide-y divide-slate-100">
          {data.top.map((t, i) => (
            <li key={t.title} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="w-4 text-xs font-semibold text-slate-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.title}</span>
              <span className="hidden text-xs text-slate-500 sm:inline">{t.stage}</span>
              <span className="whitespace-nowrap text-right tabular-nums text-slate-700">{formatUsd(t.valueUsd)} / yr</span>
            </li>
          ))}
          {!data.top.length ? <li className="px-5 py-3 text-sm text-slate-500">No AI projects yet.</li> : null}
        </ol>
      </Card>
    </div>
  );
}

function Section({ icon, title, rows, empty, note }: { icon: ReactNode; title: string; rows: string[]; empty: string; note?: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 font-semibold text-slate-900 [&_svg]:size-4">
          {icon}
          {title}
          {rows.length ? <span className="text-sm font-normal text-slate-500">({rows.length})</span> : null}
        </div>
        {rows.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {rows.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{empty}</p>
        )}
        {note && rows.length ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
      </CardBody>
    </Card>
  );
}
