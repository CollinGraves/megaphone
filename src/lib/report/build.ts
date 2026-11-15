/**
 * The monthly one-page update: what changed, what it's worth and what needs attention. Pure module:
 * the server gathers the facts, these functions shape, summarize and render them.
 */
import { STAGES, labelFrom } from "@/lib/taxonomy";

export type ReportData = {
  month: string;
  monthLabel: string;
  totals: { projects: number; live: number; testing: number; building: number; estimatedAnnualUsd: number; actualRunRateUsd: number };
  /** Actuals recorded for the month itself. */
  monthActuals: { hours: number; usd: number; projects: number };
  launched: string[];
  movedForward: { title: string; to: string }[];
  added: string[];
  blocked: { title: string; reason: string }[];
  awaitingApproval: string[];
  ideas: { new: number; open: number };
  top: { title: string; stage: string; valueUsd: number }[];
  needsActuals: string[];
};

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "YYYY-MM" for the calendar month before `now` (UTC). */
export function previousMonth(now: Date) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/** Parse "stage to Pilot" out of an initiative.updated activity's change list. */
export function stageMoveFrom(changes: unknown): string | null {
  if (!Array.isArray(changes)) return null;
  for (const c of changes) {
    const m = typeof c === "string" ? c.match(/^stage to (.+)$/) : null;
    if (m) return m[1];
  }
  return null;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const list = (xs: string[], max = 3) => (xs.length <= max ? xs.join(", ").replace(/, ([^,]*)$/, " and $1") : `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A short plain-language summary (used when no AI key is set, and as the AI's fallback). */
export function templateSummary(d: ReportData, orgName: string, opts: { soFar?: boolean } = {}): string {
  const s: string[] = [];
  const when = opts.soFar ? "so far this month" : "last month";
  s.push(`${opts.soFar ? `So far in ${d.monthLabel}` : `In ${d.monthLabel}`}, ${orgName} ${opts.soFar ? "has" : "had"} ${plural(d.totals.projects, "AI project")}, and ${d.totals.live} ${d.totals.live === 1 ? "is" : "are"} live.`);
  if (d.launched.length) s.push(`${plural(d.launched.length, "project")} went live: ${list(d.launched)}.`);
  else if (d.movedForward.length) s.push(`${plural(d.movedForward.length, "project")} moved forward, like ${d.movedForward[0].title}.`);
  if (d.monthActuals.hours > 0 || d.monthActuals.usd > 0) {
    const parts = [d.monthActuals.hours > 0 ? `about ${Math.round(d.monthActuals.hours).toLocaleString("en-US")} hours` : null, d.monthActuals.usd > 0 ? `about ${usd(d.monthActuals.usd)}` : null].filter(Boolean);
    s.push(`Projects with results saved ${parts.join(", worth ")} ${when}.`);
  } else if (d.totals.live > 0) {
    s.push(`No results were recorded ${opts.soFar ? "yet this month" : "for last month yet"}.`);
  }
  const b = d.blocked.length;
  const a = d.awaitingApproval.length;
  const projects = (n: number) => `${n} ${n === 1 ? "project is" : "projects are"}`;
  if (b && a) s.push(`${projects(b)} blocked, and ${a} ${a === 1 ? "is" : "are"} waiting for approval.`);
  else if (b) s.push(`${projects(b)} blocked.`);
  else if (a) s.push(`${projects(a)} waiting for approval.`);
  if (d.ideas.new) s.push(`People sent in ${plural(d.ideas.new, "new idea")}.`);
  return s.join(" ");
}

/** Plain text version (for copy/paste into an email or chat). */
export function reportToText(d: ReportData, orgName: string, summary: string, url: string): string {
  const section = (title: string, rows: string[]) => (rows.length ? [`${title}:`, ...rows.map((r) => `- ${r}`), ""] : []);
  return [
    `${orgName}: AI update for ${d.monthLabel}`,
    "",
    summary,
    "",
    `AI projects: ${d.totals.projects} (${d.totals.live} live, ${d.totals.testing} testing, ${d.totals.building} building)`,
    `Value per year: ${usd(d.totals.actualRunRateUsd || d.totals.estimatedAnnualUsd)}${d.totals.actualRunRateUsd ? " (from real results)" : " (estimated)"}`,
    `Last month: ${Math.round(d.monthActuals.hours).toLocaleString("en-US")} hours saved, ${usd(d.monthActuals.usd)}`,
    "",
    ...section("Went live", d.launched),
    ...section("Moved forward", d.movedForward.map((m) => `${m.title} (now ${m.to})`)),
    ...section("New this month", d.added),
    ...section("Blocked", d.blocked.map((b) => `${b.title}: ${b.reason}`)),
    ...section("Waiting for approval", d.awaitingApproval),
    ...section("Live but no results recorded", d.needsActuals),
    ...section("Top 5", d.top.map((t) => `${t.title} (${t.stage}, ${usd(t.valueUsd)} a year)`)),
    `See it in ${orgName}'s workspace: ${url}`,
  ].join("\n");
}

/** Email HTML body (wrapped by emailLayout). */
export function reportToHtml(d: ReportData, orgName: string, summary: string, url: string): string {
  const e = escapeHtml;
  const stat = (label: string, value: string) =>
    `<td style="padding:10px 12px;background:#f8fafc;border-radius:8px"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.04em">${e(label)}</div><div style="font-size:18px;font-weight:600;color:#0f172a">${e(value)}</div></td>`;
  const section = (title: string, rows: string[]) =>
    rows.length ? `<h3 style="margin:20px 0 6px;font-size:14px;color:#0f172a">${e(title)}</h3><ul style="margin:0;padding-left:18px;color:#334155;font-size:14px">${rows.map((r) => `<li style="margin:2px 0">${e(r)}</li>`).join("")}</ul>` : "";
  return `<h2 style="margin:0 0 4px;font-size:20px;color:#0f172a">${e(orgName)}: AI update for ${e(d.monthLabel)}</h2>
<p style="margin:12px 0;color:#334155;font-size:15px;line-height:1.5">${e(summary)}</p>
<table role="presentation" cellspacing="6" style="width:100%;margin:8px -6px"><tr>
${stat("AI projects", String(d.totals.projects))}${stat("Live", String(d.totals.live))}${stat("Hours saved last month", Math.round(d.monthActuals.hours).toLocaleString("en-US"))}
</tr></table>
${section("Went live", d.launched)}
${section("Moved forward", d.movedForward.map((m) => `${m.title} (now ${m.to})`))}
${section("Blocked", d.blocked.map((b) => `${b.title}: ${b.reason}`))}
${section("Waiting for approval", d.awaitingApproval)}
${section("Live but no results recorded for last month", d.needsActuals)}
${section("Top 5 AI projects", d.top.map((t) => `${t.title} (${t.stage})`))}
<p style="margin:24px 0 0"><a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the full update</a></p>`;
}

export const stageName = (slug: string) => labelFrom(STAGES, slug);
