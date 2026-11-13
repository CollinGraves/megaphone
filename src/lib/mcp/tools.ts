import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { db } from "@/db";
import {
  activityLog,
  dataDependencies,
  ideas,
  impactMeasurements,
  impactMetrics,
  initiativeAlerts,
  initiatives,
  stories,
  systems,
  userPreferences,
} from "@/db/schema";
import { loadPortfolio } from "@/app/(app)/w/[slug]/_lib/portfolio";
import { notifyTriagersOfNewIdea } from "@/app/(app)/w/[slug]/ideas/_lib/server";
import { appUrl } from "@/lib/env";
import { getStackContext, storyContext, upcomingDeadlines } from "@/lib/graph/personalize";
import { estimateAnnualHours } from "@/lib/ideas";
import { getStoryBySlug, listStories } from "@/lib/stories";
import { CATEGORY_SLUGS, STAGES, VENDOR_SLUGS, categoryLabel, labelFrom, vendorLabel } from "@/lib/taxonomy";
import { rateLimit } from "@/lib/rate-limit";
import { loadPrincipal, McpAccessError, requireWorkspace, type Principal } from "./principal";
import { BRAND } from "@/lib/brand";

const MCP_CALLS_PER_MINUTE = 120;

type ToolCtx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/** Wrap a tool body: resolve the caller from the verified key and turn access errors into tool errors. */
function withPrincipal<A>(fn: (args: A, p: Principal) => Promise<ToolResult>) {
  return async (args: A, ctx: ToolCtx): Promise<ToolResult> => {
    const keyId = ctx.http?.authInfo?.extra?.keyId;
    if (typeof keyId !== "string") return fail("Not authenticated.");
    const p = await loadPrincipal(keyId);
    if (!p) return fail("This API key has been revoked.");
    const limited = await rateLimit(`mcp:key:${keyId}`, MCP_CALLS_PER_MINUTE, 60);
    if (!limited.allowed) return fail(`Rate limit reached (${MCP_CALLS_PER_MINUTE} calls per minute). Retry in ${limited.retryAfterSeconds}s.`);
    try {
      return await fn(args, p);
    } catch (err) {
      if (err instanceof McpAccessError) return fail(err.message);
      console.error("[mcp] tool failed", err);
      return fail("Something went wrong running this tool.");
    }
  };
}

const storyOut = (s: typeof stories.$inferSelect) => ({
  title: s.title,
  summary: s.summary,
  why_it_matters: s.whyItMatters,
  importance: s.importance,
  categories: s.categories.map(categoryLabel),
  vendors: s.vendors.map(vendorLabel),
  published_at: s.publishedAt.toISOString(),
  sources: s.articleCount,
  slug: s.slug,
  url: `${appUrl()}/radar/${s.slug}`,
  original_url: s.primaryUrl,
});

const READ = { readOnlyHint: true, openWorldHint: false } as const;

export function registerRadarTools(server: McpServer) {
  /* ─────────────────────────────── News (any key) ─────────────────────────────── */

  server.registerTool(
    "radar_search_stories",
    {
      title: "Search AI news",
      description:
        `Search ${BRAND}'s deduplicated, ranked AI news. Filter by text, category, vendor and recency. Importance is 1 (trivia) to 5 (major).`,
      inputSchema: z.object({
        query: z.string().max(100).optional().describe("Words to match in titles and summaries"),
        category: z.enum(CATEGORY_SLUGS as [string, ...string[]]).optional(),
        vendor: z.enum(VENDOR_SLUGS as [string, ...string[]]).optional(),
        days: z.number().int().min(1).max(365).default(14),
        min_importance: z.number().int().min(1).max(5).default(2),
        limit: z.number().int().min(1).max(50).default(10),
      }),
      annotations: READ,
    },
    withPrincipal(async (a: { query?: string; category?: string; vendor?: string; days: number; min_importance: number; limit: number }) => {
      const rows = await listStories({
        search: a.query,
        categories: a.category ? [a.category] : undefined,
        vendors: a.vendor ? [a.vendor] : undefined,
        sinceDays: a.days,
        minImportance: a.min_importance,
        limit: a.limit,
        order: a.query ? "recent" : "top",
      });
      return ok({ count: rows.length, stories: rows.map(storyOut) });
    }),
  );

  server.registerTool(
    "radar_top_stories",
    {
      title: "Top AI stories",
      description: "The most significant AI stories over a recent window, ranked by importance and coverage.",
      inputSchema: z.object({ days: z.number().int().min(1).max(30).default(7), limit: z.number().int().min(1).max(30).default(10) }),
      annotations: READ,
    },
    withPrincipal(async (a: { days: number; limit: number }) => {
      const rows = await listStories({ sinceDays: a.days, order: "top", limit: a.limit });
      return ok({ stories: rows.map(storyOut) });
    }),
  );

  server.registerTool(
    "radar_get_story",
    {
      title: "Get a story",
      description: "Full details for one story: summary, why it matters, all covering sources, and the timeline of related facts.",
      inputSchema: z.object({ slug: z.string().min(1).max(200) }),
      annotations: READ,
    },
    withPrincipal(async (a: { slug: string }) => {
      const found = await getStoryBySlug(a.slug);
      if (!found) return fail("Story not found.");
      const graph = await storyContext(found.story.id);
      return ok({
        ...storyOut(found.story),
        coverage: found.coverage.map((c) => ({ title: c.title, source: c.sourceName, url: c.url, published_at: c.publishedAt.toISOString() })),
        facts: graph.facts.map(({ fact, subjectName, objectName }) => ({
          subject: subjectName,
          predicate: fact.predicate,
          object: objectName,
          value: fact.value,
          date: fact.validFrom,
          current: !fact.supersededById,
        })),
        related_updates: graph.links.map((l) => ({ title: l.title, slug: l.slug, relation: l.direction === "later" ? "newer update" : "earlier story" })),
      });
    }),
  );

  server.registerTool(
    "radar_my_company",
    {
      title: "My company's stack and deadlines",
      description:
        `The tools ${BRAND} believes your company runs on (confirmed or inferred) and upcoming retirements, deprecations and regulatory dates that affect them or vendors you follow.`,
      inputSchema: z.object({ days: z.number().int().min(7).max(365).default(180) }),
      annotations: READ,
    },
    withPrincipal(async (a: { days: number }, p) => {
      const [stack, [prefs]] = await Promise.all([
        getStackContext(p.user),
        db.select().from(userPreferences).where(eq(userPreferences.userId, p.user.id)).limit(1),
      ]);
      const deadlines = await upcomingDeadlines({
        entityIds: stack?.entityIds,
        vendorSlugs: [...new Set([...(stack?.vendorSlugs ?? []), ...(prefs?.vendors ?? [])])],
        includeRegulation: prefs?.categories.includes("regulation"),
        days: a.days,
        limit: 25,
      });
      return ok({
        company: stack?.companyName ?? null,
        stack: (stack?.items ?? []).map((i) => ({ name: i.entity.name, status: i.status, confidence: Number(i.confidence.toFixed(2)) })),
        deadlines: deadlines.map((d) => ({ what: d.entityName, change: d.predicate, date: d.date, affects_your_stack: d.inStack, story: d.storySlug ? `${appUrl()}/radar/${d.storySlug}` : null })),
        note: stack ? undefined : "Sign up with a company email to get a company stack.",
      });
    }),
  );

  /* ─────────────────────────── Workspace (workspace-scoped keys) ─────────────────────────── */

  server.registerTool(
    "workspace_portfolio_summary",
    {
      title: "AI portfolio summary",
      description: "Totals for the connected workspace: initiatives by stage, estimated vs actual annual value, hours saved, ROI, open alerts.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withPrincipal(async (_a: Record<string, never>, p) => {
      const ws = requireWorkspace(p, "workspace:view");
      const { items, totals, roiActual, roiEstimated } = await loadPortfolio(ws.org);
      const byStage = Object.fromEntries(STAGES.map((s) => [s.label, items.filter((i) => i.stage === s.slug).length]));
      const [alerts] = await db
        .select({ id: initiativeAlerts.id })
        .from(initiativeAlerts)
        .where(and(eq(initiativeAlerts.orgId, ws.org.id), isNull(initiativeAlerts.dismissedAt)));
      return ok({
        workspace: ws.org.name,
        your_role: ws.access.role,
        initiatives_by_stage: byStage,
        estimated_annual_value_usd: Math.round(totals.estimatedAnnualUsd),
        actual_run_rate_value_usd: Math.round(totals.actualRunRateUsd),
        actual_trailing_12_months_usd: Math.round(totals.actualTrailing12Usd),
        estimated_hours_saved_per_year: Math.round(totals.estimatedAnnualHours),
        actual_hours_saved_run_rate: Math.round(totals.actualRunRateHours),
        roi_on_actuals: roiActual,
        roi_estimated: roiEstimated,
        has_open_radar_alerts: Boolean(alerts),
        url: `${appUrl()}/w/${ws.org.slug}`,
      });
    }),
  );

  server.registerTool(
    "workspace_list_initiatives",
    {
      title: "List AI initiatives",
      description: "The workspace's AI initiatives in priority order, with stage, health, platforms, score and value.",
      inputSchema: z.object({
        stage: z.enum(STAGES.map((s) => s.slug) as [string, ...string[]]).optional(),
        search: z.string().max(100).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      annotations: READ,
    },
    withPrincipal(async (a: { stage?: string; search?: string; limit: number }, p) => {
      const ws = requireWorkspace(p, "workspace:view");
      const { items } = await loadPortfolio(ws.org);
      const q = a.search?.toLowerCase();
      const rows = items
        .filter((i) => (!a.stage || i.stage === a.stage) && (!q || `${i.title} ${i.problemStatement} ${i.ownerName ?? ""}`.toLowerCase().includes(q)))
        .slice(0, a.limit);
      return ok({
        initiatives: rows.map((i) => ({
          id: i.id,
          rank: i.rank,
          title: i.title,
          stage: labelFrom(STAGES, i.stage),
          health: i.health,
          priority_score: Math.round(i.score),
          platforms: i.platforms.map(vendorLabel),
          owner: i.ownerName,
          business_unit: i.businessUnit,
          estimated_annual_value_usd: Math.round(i.impact.estimatedAnnualUsd),
          actual_run_rate_value_usd: i.impact.hasActuals ? Math.round(i.impact.actualRunRateUsd) : null,
          risk_tier: i.riskTier,
          approval_status: i.approvalStatus,
        })),
      });
    }),
  );

  server.registerTool(
    "workspace_get_initiative",
    {
      title: "Get an AI initiative",
      description: "Everything about one initiative: problem, solution, impact metrics (with metric ids for recording actuals), data dependencies, governance.",
      inputSchema: z.object({ id: z.string().min(1).max(64) }),
      annotations: READ,
    },
    withPrincipal(async (a: { id: string }, p) => {
      const ws = requireWorkspace(p, "workspace:view");
      const [i] = await db.select().from(initiatives).where(and(eq(initiatives.id, a.id), eq(initiatives.orgId, ws.org.id))).limit(1);
      if (!i) return fail("Initiative not found in this workspace.");
      const [metrics, deps] = await Promise.all([
        db.select().from(impactMetrics).where(eq(impactMetrics.initiativeId, i.id)),
        db
          .select({ dep: dataDependencies, system: systems.name })
          .from(dataDependencies)
          .innerJoin(systems, eq(systems.id, dataDependencies.systemId))
          .where(eq(dataDependencies.initiativeId, i.id)),
      ]);
      const measurements = metrics.length
        ? await db
            .select()
            .from(impactMeasurements)
            .where(inArray(impactMeasurements.metricId, metrics.map((m) => m.id)))
            .orderBy(desc(impactMeasurements.periodStart))
        : [];
      return ok({
        id: i.id,
        title: i.title,
        stage: labelFrom(STAGES, i.stage),
        health: i.health,
        problem: i.problemStatement,
        solution: i.proposedSolution,
        owner: i.ownerName,
        sponsor: i.sponsor,
        business_unit: i.businessUnit,
        platforms: i.platforms.map(vendorLabel),
        models: i.models,
        target_date: i.targetDate,
        impact_metrics: metrics.map((m) => ({
          metric_id: m.id,
          name: m.name,
          type: m.type,
          unit: m.unit,
          period: m.period,
          estimated_value: m.estimatedValue,
          recent_actuals: measurements
            .filter((x) => x.metricId === m.id)
            .slice(0, 6)
            .map((x) => ({ month: x.periodStart.slice(0, 7), value: x.value })),
        })),
        data_dependencies: deps.map((d) => ({ system: d.system, data: d.dep.dataDescription, access: d.dep.accessStatus, sensitivity: d.dep.sensitivity })),
        governance: {
          risk_tier: i.riskTier,
          human_oversight: i.humanOversight,
          approval_status: i.approvalStatus,
          conditions: i.approvalConditions,
          review_due: i.reviewDueOn,
        },
        url: `${appUrl()}/w/${ws.org.slug}/initiatives/${i.id}`,
      });
    }),
  );

  server.registerTool(
    "workspace_list_ideas",
    {
      title: "List submitted AI ideas",
      description: "Ideas submitted by employees. Triagers see all ideas; other members see only their own.",
      inputSchema: z.object({
        status: z.enum(["new", "under_review", "accepted", "declined", "duplicate"]).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
      annotations: READ,
    },
    withPrincipal(async (a: { status?: string; limit: number }, p) => {
      const ws = requireWorkspace(p, "ideas:submit");
      const triager = p.workspace ? ["owner", "admin", "editor"].includes(ws.access.role) : false;
      const rows = await db
        .select()
        .from(ideas)
        .where(
          and(
            eq(ideas.orgId, ws.org.id),
            a.status ? eq(ideas.status, a.status as typeof ideas.$inferSelect.status) : undefined,
            triager ? undefined : eq(ideas.submittedById, p.user.id),
          ),
        )
        .orderBy(desc(ideas.createdAt))
        .limit(a.limit);
      return ok({
        ideas: rows.map((i) => ({
          id: i.id,
          title: i.title,
          problem: i.problem,
          department: i.department,
          status: i.status,
          urgency: i.urgency,
          estimated_hours_per_year: estimateAnnualHours(i),
          submitted_by: i.submitterName,
          submitted_at: i.createdAt.toISOString(),
        })),
      });
    }),
  );

  server.registerTool(
    "workspace_submit_idea",
    {
      title: "Submit an AI idea",
      description:
        "Submit an idea for an AI initiative to the workspace's AI team for triage. Describe the problem in business terms; include rough time spent today if known.",
      inputSchema: z.object({
        title: z.string().min(3).max(150),
        problem: z.string().min(10).max(4000),
        desired_outcome: z.string().max(2000).optional(),
        department: z.string().max(100).optional(),
        hours_per_week: z.number().min(0).max(60).optional().describe("Time spent on the task today, per person per week"),
        people_affected: z.number().int().min(1).max(100000).optional(),
        urgency: z.enum(["low", "medium", "high"]).default("medium"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    withPrincipal(
      async (
        a: { title: string; problem: string; desired_outcome?: string; department?: string; hours_per_week?: number; people_affected?: number; urgency: "low" | "medium" | "high" },
        p,
      ) => {
        const ws = requireWorkspace(p, "ideas:submit", true);
        const [idea] = await db
          .insert(ideas)
          .values({
            orgId: ws.org.id,
            title: a.title,
            problem: a.problem,
            desiredOutcome: a.desired_outcome ?? null,
            department: a.department ?? null,
            hoursPerWeek: a.hours_per_week ?? null,
            peopleAffected: a.people_affected ?? null,
            urgency: a.urgency,
            submitterName: p.user.name,
            submitterEmail: p.user.email,
            submittedById: p.user.id,
            channel: "workspace",
          })
          .returning();
        await db.insert(activityLog).values({ orgId: ws.org.id, userId: p.user.id, action: "idea.submitted", detail: { ideaId: idea.id, title: idea.title, via: "mcp" } });
        await notifyTriagersOfNewIdea(ws.org, idea).catch((err) => console.error("[mcp] notify failed", err));
        return ok({ submitted: true, id: idea.id, url: `${appUrl()}/w/${ws.org.slug}/ideas/${idea.id}` });
      },
    ),
  );

  server.registerTool(
    "workspace_record_impact",
    {
      title: "Record an impact actual",
      description:
        "Record the actual value of an impact metric for a month (e.g. hours saved in March). Re-recording a month overwrites it. Get metric ids from workspace_get_initiative.",
      inputSchema: z.object({
        metric_id: z.string().min(1).max(64),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).describe("YYYY-MM"),
        value: z.number().min(0).max(1e12),
        note: z.string().max(500).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    withPrincipal(async (a: { metric_id: string; month: string; value: number; note?: string }, p) => {
      const ws = requireWorkspace(p, "impact:write", true);
      const [metric] = await db
        .select({ metric: impactMetrics, initiativeId: initiatives.id, title: initiatives.title })
        .from(impactMetrics)
        .innerJoin(initiatives, eq(initiatives.id, impactMetrics.initiativeId))
        .where(and(eq(impactMetrics.id, a.metric_id), eq(initiatives.orgId, ws.org.id)))
        .limit(1);
      if (!metric) return fail("Metric not found in this workspace.");
      const periodStart = `${a.month}-01`;
      await db
        .insert(impactMeasurements)
        .values({ metricId: metric.metric.id, periodStart, value: a.value, note: a.note ?? null, recordedById: p.user.id })
        .onConflictDoUpdate({
          target: [impactMeasurements.metricId, impactMeasurements.periodStart],
          set: { value: a.value, note: a.note ?? null, recordedById: p.user.id },
        });
      await db.insert(activityLog).values({
        orgId: ws.org.id,
        userId: p.user.id,
        initiativeId: metric.initiativeId,
        action: "impact.recorded",
        detail: { metric: metric.metric.name, period: a.month, value: a.value, via: "mcp" },
      });
      return ok({ recorded: true, initiative: metric.title, metric: metric.metric.name, month: a.month, value: a.value });
    }),
  );

  server.registerTool(
    "workspace_radar_alerts",
    {
      title: "Radar alerts for the portfolio",
      description: "Open alerts where AI news (pricing, deprecations, security, regulation…) affects a platform an initiative is built on.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }),
      annotations: READ,
    },
    withPrincipal(async (a: { limit: number }, p) => {
      const ws = requireWorkspace(p, "workspace:view");
      const rows = await db
        .select({ alert: initiativeAlerts, initiative: initiatives.title, story: stories })
        .from(initiativeAlerts)
        .innerJoin(initiatives, eq(initiatives.id, initiativeAlerts.initiativeId))
        .innerJoin(stories, eq(stories.id, initiativeAlerts.storyId))
        .where(and(eq(initiativeAlerts.orgId, ws.org.id), isNull(initiativeAlerts.dismissedAt)))
        .orderBy(desc(initiativeAlerts.createdAt))
        .limit(a.limit);
      return ok({ alerts: rows.map((r) => ({ initiative: r.initiative, reason: r.alert.reason, story: storyOut(r.story) })) });
    }),
  );

  server.registerTool(
    "workspace_governance_register",
    {
      title: "AI use-case register",
      description: "Governance view of every active initiative: risk tier, human oversight, approval status and review dates, plus items needing attention.",
      inputSchema: z.object({}),
      annotations: READ,
    },
    withPrincipal(async (_a: Record<string, never>, p) => {
      const ws = requireWorkspace(p, "workspace:view");
      const today = new Date().toISOString().slice(0, 10);
      const rows = await db
        .select()
        .from(initiatives)
        .where(and(eq(initiatives.orgId, ws.org.id), isNull(initiatives.archivedAt)))
        .orderBy(initiatives.title);
      const active = rows.filter((r) => r.stage !== "retired");
      return ok({
        register: active.map((r) => ({
          id: r.id,
          title: r.title,
          stage: labelFrom(STAGES, r.stage),
          risk_tier: r.riskTier,
          human_oversight: r.humanOversight,
          customer_facing: r.customerFacing,
          affects_individuals: r.affectsIndividuals,
          approval_status: r.approvalStatus,
          review_due: r.reviewDueOn,
          platforms: r.platforms.map(vendorLabel),
          models: r.models,
        })),
        needs_attention: {
          pending_review: active.filter((r) => r.approvalStatus === "pending").map((r) => r.title),
          overdue_review: active.filter((r) => r.reviewDueOn && r.reviewDueOn < today).map((r) => r.title),
          unclassified_in_pilot_or_production: active
            .filter((r) => r.riskTier === "unclassified" && (r.stage === "pilot" || r.stage === "production"))
            .map((r) => r.title),
        },
      });
    }),
  );
}

/** Used in tests and docs: every tool and whether it writes. */
export const TOOL_CATALOG = [
  { name: "radar_search_stories", scope: "news", write: false },
  { name: "radar_top_stories", scope: "news", write: false },
  { name: "radar_get_story", scope: "news", write: false },
  { name: "radar_my_company", scope: "news", write: false },
  { name: "workspace_portfolio_summary", scope: "workspace", write: false },
  { name: "workspace_list_initiatives", scope: "workspace", write: false },
  { name: "workspace_get_initiative", scope: "workspace", write: false },
  { name: "workspace_list_ideas", scope: "workspace", write: false },
  { name: "workspace_submit_idea", scope: "workspace", write: true },
  { name: "workspace_record_impact", scope: "workspace", write: true },
  { name: "workspace_radar_alerts", scope: "workspace", write: false },
  { name: "workspace_governance_register", scope: "workspace", write: false },
] as const;
