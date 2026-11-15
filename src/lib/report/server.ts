import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, count, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  dataDependencies,
  ideas,
  impactMeasurements,
  impactMetrics,
  initiatives,
  memberships,
  organizations,
  systems,
  user,
  workspaceReports,
  type Organization,
} from "@/db/schema";
import { bestValue, loadPortfolio } from "@/app/(app)/w/[slug]/_lib/portfolio";
import { BRAND } from "@/lib/brand";
import { emailLayout, sendEmail } from "@/lib/email";
import { appUrl, hasAnthropic } from "@/lib/env";
import { dollarsPerUnit } from "@/lib/impact";
import { DEFAULT_MODEL } from "@/lib/ingest/llm";
import { monthLabel, monthRange, previousMonth, reportToHtml, reportToText, stageMoveFrom, stageName, templateSummary, type ReportData } from "./build";

/** Gather the month's facts for a workspace (portfolio state is as of now; changes are within the month). */
export async function loadReportData(org: Organization, month: string): Promise<ReportData> {
  const { start, end } = monthRange(month);
  const periodStart = `${month}-01`;
  const [{ items }, activity, measurements, blockedDeps, [newIdeas], [openIdeas]] = await Promise.all([
    loadPortfolio(org),
    db
      .select({ action: activityLog.action, detail: activityLog.detail, initiativeId: activityLog.initiativeId })
      .from(activityLog)
      .where(and(eq(activityLog.orgId, org.id), inArray(activityLog.action, ["initiative.created", "initiative.updated"]), gte(activityLog.createdAt, start), lt(activityLog.createdAt, end))),
    db
      .select({ initiativeId: initiatives.id, value: impactMeasurements.value, type: impactMetrics.type, unit: impactMetrics.unit, hourlyRate: impactMetrics.hourlyRate })
      .from(impactMeasurements)
      .innerJoin(impactMetrics, eq(impactMetrics.id, impactMeasurements.metricId))
      .innerJoin(initiatives, eq(initiatives.id, impactMetrics.initiativeId))
      .where(and(eq(initiatives.orgId, org.id), eq(impactMeasurements.periodStart, periodStart))),
    db
      .select({ initiativeId: dataDependencies.initiativeId, system: systems.name })
      .from(dataDependencies)
      .innerJoin(systems, eq(systems.id, dataDependencies.systemId))
      .innerJoin(initiatives, eq(initiatives.id, dataDependencies.initiativeId))
      .where(and(eq(initiatives.orgId, org.id), eq(dataDependencies.accessStatus, "blocked"), isNull(initiatives.archivedAt))),
    db.select({ n: count() }).from(ideas).where(and(eq(ideas.orgId, org.id), gte(ideas.createdAt, start), lt(ideas.createdAt, end))),
    db.select({ n: count() }).from(ideas).where(and(eq(ideas.orgId, org.id), inArray(ideas.status, ["new", "under_review"]))),
  ]);

  const active = items.filter((i) => !i.archivedAt && i.stage !== "retired");
  const byId = new Map(active.map((i) => [i.id, i]));
  const moves = new Map<string, string>();
  const added: string[] = [];
  for (const a of activity) {
    const d = (a.detail ?? {}) as Record<string, unknown>;
    if (a.action === "initiative.created" && typeof d.title === "string") added.push(d.title);
    const to = a.action === "initiative.updated" ? stageMoveFrom(d.changes) : null;
    if (to && a.initiativeId && byId.has(a.initiativeId)) moves.set(a.initiativeId, to); // last move in the month wins
  }
  const launched = [...moves].filter(([, to]) => to === "Production").map(([id]) => byId.get(id)!.title);
  const movedForward = [...moves].filter(([, to]) => to !== "Production" && to !== "Retired").map(([id, to]) => ({ title: byId.get(id)!.title, to }));

  let hours = 0;
  let usd = 0;
  const measured = new Set<string>();
  for (const m of measurements) {
    measured.add(m.initiativeId);
    if (m.type === "hours_saved") hours += m.value;
    usd += m.value * (dollarsPerUnit({ type: m.type, unit: m.unit, hourlyRate: m.hourlyRate }, org.defaultHourlyRate) ?? 0);
  }

  const blocked = new Map<string, string>();
  for (const i of active) if (i.health === "blocked") blocked.set(i.id, "Marked as blocked");
  for (const d of blockedDeps) if (byId.has(d.initiativeId)) blocked.set(d.initiativeId, `Can't get access to ${d.system}`);

  const ranked = [...active].filter((i) => i.rank != null).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  return {
    month,
    monthLabel: monthLabel(month),
    totals: {
      projects: active.length,
      live: active.filter((i) => i.stage === "production").length,
      testing: active.filter((i) => i.stage === "pilot").length,
      building: active.filter((i) => i.stage === "building").length,
      estimatedAnnualUsd: active.reduce((n, i) => n + i.impact.estimatedAnnualUsd, 0),
      actualRunRateUsd: active.reduce((n, i) => n + i.impact.actualRunRateUsd, 0),
    },
    monthActuals: { hours, usd, projects: measured.size },
    launched,
    movedForward,
    added: added.slice(0, 20),
    blocked: [...blocked].map(([id, reason]) => ({ title: byId.get(id)!.title, reason })),
    awaitingApproval: active.filter((i) => i.approvalStatus === "pending").map((i) => i.title),
    ideas: { new: newIdeas?.n ?? 0, open: openIdeas?.n ?? 0 },
    top: ranked.slice(0, 5).map((i) => ({ title: i.title, stage: stageName(i.stage), valueUsd: bestValue(i.impact) })),
    needsActuals: active.filter((i) => i.stage === "production" && i.metricCount > 0 && !measured.has(i.id)).map((i) => i.title),
  };
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

/** A short summary in plain words: AI when a key is set, otherwise (or on failure) the template. */
export async function writeSummary(data: ReportData, orgName: string): Promise<{ summary: string; generator: string }> {
  const fallback = { summary: templateSummary(data, orgName), generator: "template" };
  if (!hasAnthropic()) return fallback;
  try {
    const model = process.env.AI_RADAR_MODEL || DEFAULT_MODEL;
    const response = await getClient().messages.create({
      model,
      max_tokens: 1000,
      system: `You write the opening paragraph of a monthly AI update that a company's leaders read in under a minute.
Write 3 to 5 short sentences at a 5th grade reading level. Lead with the most important change. Use only the facts given; never invent numbers or names. Mention what needs attention (blocked projects, approvals waiting, live projects with no results recorded). Plain text only: no headings, lists, bold or emoji. Never use em dashes.`,
      messages: [{ role: "user", content: `Company: ${orgName}\nFacts as JSON:\n${JSON.stringify(data)}` }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .replace(/\s*—\s*/g, ", ")
      .trim();
    return text ? { summary: text.slice(0, 1500), generator: response.model ?? model } : fallback;
  } catch (err) {
    console.error("[report] summary failed, using the template", err);
    return fallback;
  }
}

export async function getSavedReport(orgId: string, month: string) {
  const [row] = await db
    .select()
    .from(workspaceReports)
    .where(and(eq(workspaceReports.orgId, orgId), eq(workspaceReports.month, month)))
    .limit(1);
  return row ?? null;
}

/** The saved report for a finished month, creating it (once) if needed. */
export async function getOrCreateReport(org: Organization, month: string) {
  const existing = await getSavedReport(org.id, month);
  if (existing) return existing;
  const data = await loadReportData(org, month);
  const { summary, generator } = await writeSummary(data, org.name);
  const [row] = await db
    .insert(workspaceReports)
    .values({ orgId: org.id, month, data: data as unknown as Record<string, unknown>, summary, generator })
    .onConflictDoNothing()
    .returning();
  return row ?? (await getSavedReport(org.id, month))!;
}

export const reportUrl = (slug: string, month: string) => `${appUrl()}/w/${slug}/report?month=${month}`;

/** Email the previous month's update to each workspace's owners and admins (once per workspace per month). */
export async function sendMonthlyReports(now = new Date()) {
  const month = previousMonth(now);
  const orgs = await db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.status, "active"),
        eq(organizations.monthlyReport, true),
        sql`exists (select 1 from ${initiatives} i where i.org_id = ${organizations.id} and i.archived_at is null)`,
      ),
    );
  const tally = { month, workspaces: orgs.length, sent: 0, skipped: 0, failed: 0 };
  for (const org of orgs) {
    try {
      const report = await getOrCreateReport(org, month);
      if (report.sentAt) {
        tally.skipped++;
        continue;
      }
      // Claim the send so overlapping runs don't email twice.
      const [claimed] = await db
        .update(workspaceReports)
        .set({ sentAt: new Date() })
        .where(and(eq(workspaceReports.id, report.id), isNull(workspaceReports.sentAt)))
        .returning({ id: workspaceReports.id });
      if (!claimed) {
        tally.skipped++;
        continue;
      }
      const recipients = await db
        .select({ email: user.email })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(and(eq(memberships.orgId, org.id), inArray(memberships.role, ["owner", "admin"])));
      const data = report.data as unknown as ReportData;
      const url = reportUrl(org.slug, month);
      await Promise.allSettled(
        recipients.map((r) =>
          sendEmail({
            to: r.email,
            subject: `${org.name}: AI update for ${data.monthLabel}`,
            html: emailLayout({
              preheader: report.summary.slice(0, 140),
              body: reportToHtml(data, org.name, report.summary, url),
              footer: `You get this as an owner or admin of ${org.name} on ${BRAND}. Turn it off in the workspace's Settings.`,
            }),
            text: reportToText(data, org.name, report.summary, url),
          }),
        ),
      );
      tally.sent++;
    } catch (err) {
      console.error(`[report] ${org.slug} failed`, err);
      tally.failed++;
    }
  }
  return tally;
}
