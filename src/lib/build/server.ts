import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import {
  activityLog,
  buildBriefs,
  buildUpdates,
  dataDependencies,
  impactMetrics,
  initiatives,
  memberships,
  organizations,
  systems,
  user,
  type Initiative,
  type Organization,
} from "@/db/schema";
import { BRAND } from "@/lib/brand";
import { hasAnthropic } from "@/lib/env";
import { getCompanyStack } from "@/lib/graph/stack";
import { DEFAULT_MODEL } from "@/lib/ingest/llm";
import { briefsPerMonth } from "@/lib/plans";
import { vendorLabel } from "@/lib/taxonomy";
import { formatContext, type BriefContext } from "./context";
import { BuildBriefSchema, parseBrief, type BuildBrief } from "./schema";
import { templateBrief } from "./template";

const QUOTA_WINDOW_DAYS = 30;

export async function loadBriefContext(org: Organization, initiative: Initiative, guidance: string | null): Promise<BriefContext> {
  const [metrics, deps, orgSystems, platformRows, domains] = await Promise.all([
    db.select().from(impactMetrics).where(eq(impactMetrics.initiativeId, initiative.id)),
    db
      .select({ dep: dataDependencies, system: systems })
      .from(dataDependencies)
      .innerJoin(systems, eq(systems.id, dataDependencies.systemId))
      .where(eq(dataDependencies.initiativeId, initiative.id)),
    db.select().from(systems).where(eq(systems.orgId, org.id)),
    db.select({ platforms: initiatives.platforms }).from(initiatives).where(and(eq(initiatives.orgId, org.id), isNull(initiatives.archivedAt))),
    db
      .selectDistinct({ domain: user.companyDomain })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(and(eq(memberships.orgId, org.id), isNotNull(user.companyDomain))),
  ]);
  const stackNames = new Set<string>();
  for (const { domain } of domains.slice(0, 5)) {
    if (!domain) continue;
    for (const item of await getCompanyStack(domain)) stackNames.add(item.entity.name);
  }
  return {
    org: { name: org.name, industry: org.industry, defaultHourlyRate: org.defaultHourlyRate },
    initiative: {
      title: initiative.title,
      problem: initiative.problemStatement,
      solution: initiative.proposedSolution,
      businessUnit: initiative.businessUnit,
      stage: initiative.stage,
      platforms: initiative.platforms.map(vendorLabel),
      models: initiative.models,
      buildApproach: initiative.buildApproach,
      riskTier: initiative.riskTier,
      customerFacing: initiative.customerFacing,
      affectsIndividuals: initiative.affectsIndividuals,
      humanOversight: initiative.humanOversight,
      targetDate: initiative.targetDate,
    },
    metrics: metrics.map((m) => ({ name: m.name, type: m.type, unit: m.unit, period: m.period, estimatedValue: m.estimatedValue, assumptions: m.assumptions })),
    dependencies: deps.map((d) => ({
      system: d.system.name,
      category: d.system.category,
      vendor: d.system.vendor,
      data: d.dep.dataDescription,
      access: d.dep.accessStatus,
      sensitivity: d.dep.sensitivity,
    })),
    portfolioPlatforms: [...new Set(platformRows.flatMap((r) => r.platforms))].map(vendorLabel),
    systems: orgSystems.map((s) => ({ name: s.name, category: s.category, vendor: s.vendor })),
    stack: [...stackNames],
    guidance,
  };
}

const SYSTEM_PROMPT = `You are a senior AI solutions architect at North Labs, writing a build brief for a mid-market company's AI initiative inside ${BRAND}.

Your brief turns an idea into something a team can build this month. Principles:
- Be platform-neutral, but strongly prefer tools the company already runs (its portfolio platforms, systems and known stack). Many mid-market wins are configuration of existing tools (Copilot Studio, Custom GPTs, Claude Projects, Gemini Gems) or low-code workflows, not custom software. Recommend a custom build only when risk, integration depth or scale requires it.
- Offer 2–3 genuinely different options and recommend one. Explain "why" in terms of THIS company's stack, data and risk tier.
- Respect governance: match human oversight to the risk tier; high-risk or decisions about individuals need a person in the loop. Handle regulated data (PII/PHI/PCI) with minimization, masking and least privilege.
- Be concrete: real product names, connectors, steps. The draft system prompt must be usable as-is.
- Never invent facts about the company. Where something is unknown, put it in open_questions. Use qualitative cost notes unless the inputs give numbers.
- Test cases must be synthetic and must not contain real personal data.
- Tickets are developer-ready, in build order, for the recommended option.`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

async function generateWithModel(context: BriefContext): Promise<{ brief: BuildBrief; generator: string }> {
  const model = process.env.AI_RADAR_BRIEF_MODEL || process.env.AI_RADAR_MODEL || DEFAULT_MODEL;
  const response = await getClient().beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(BuildBriefSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Write the build brief for this initiative.\n\n${formatContext(context)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error(`The model declined to write this brief (${response.stop_details?.category ?? "unknown"}).`);
  if (response.stop_reason === "max_tokens") throw new Error("The brief was too long to finish. Try again with narrower guidance.");
  const brief = response.parsed_output ? parseBrief(response.parsed_output) : null;
  if (!brief) throw new Error("The model's brief couldn't be read.");
  return { brief, generator: response.model ?? model };
}

/** How many briefs this org can still generate in the rolling window (null = unlimited). */
export async function briefQuota(org: Pick<Organization, "id" | "plan">) {
  const limit = briefsPerMonth(org.plan);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(buildBriefs)
    .where(and(eq(buildBriefs.orgId, org.id), gte(buildBriefs.createdAt, new Date(Date.now() - QUOTA_WINDOW_DAYS * 864e5))));
  return { limit, used: n, remaining: limit == null ? null : Math.max(0, limit - n) };
}

/** Run generation for an existing "generating" row and store the result. */
export async function runBriefGeneration(briefId: string) {
  const [row] = await db.select().from(buildBriefs).where(eq(buildBriefs.id, briefId)).limit(1);
  if (!row || row.status !== "generating") return;
  const [[org], [initiative]] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, row.orgId)).limit(1),
    db.select().from(initiatives).where(eq(initiatives.id, row.initiativeId)).limit(1),
  ]);
  if (!org || !initiative) return;
  try {
    const context = await loadBriefContext(org, initiative, row.guidance);
    const { brief, generator } = hasAnthropic() ? await generateWithModel(context) : { brief: templateBrief(context), generator: "template" };
    await db
      .update(buildBriefs)
      .set({ status: "ready", content: brief as unknown as Record<string, unknown>, generator, completedAt: new Date(), error: null })
      .where(eq(buildBriefs.id, briefId));
    await db.insert(activityLog).values({
      orgId: org.id,
      userId: row.createdById,
      initiativeId: initiative.id,
      action: "build.brief_generated",
      detail: { version: row.version, generator },
    });
  } catch (err) {
    console.error("[build] brief generation failed", err);
    await db
      .update(buildBriefs)
      .set({ status: "failed", error: err instanceof Error ? err.message.slice(0, 500) : "Generation failed", completedAt: new Date() })
      .where(eq(buildBriefs.id, briefId));
  }
}

/** Create the next version row and generate it after the response (falls back to inline outside a request). */
export async function startBriefGeneration(opts: { org: Organization; initiative: Initiative; userId: string; guidance: string | null }) {
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${buildBriefs.version}), 0)::int` })
    .from(buildBriefs)
    .where(eq(buildBriefs.initiativeId, opts.initiative.id));
  const [row] = await db
    .insert(buildBriefs)
    .values({
      orgId: opts.org.id,
      initiativeId: opts.initiative.id,
      version: max + 1,
      status: "generating",
      guidance: opts.guidance,
      createdById: opts.userId,
    })
    .returning();
  try {
    after(() => runBriefGeneration(row.id));
  } catch {
    await runBriefGeneration(row.id);
  }
  return row;
}

export async function listBriefs(initiativeId: string) {
  return db
    .select({ brief: buildBriefs, author: user.name })
    .from(buildBriefs)
    .leftJoin(user, eq(user.id, buildBriefs.createdById))
    .where(eq(buildBriefs.initiativeId, initiativeId))
    .orderBy(desc(buildBriefs.version));
}

/** Latest *ready* brief for an initiative, parsed. */
export async function latestReadyBrief(initiativeId: string) {
  const [row] = await db
    .select()
    .from(buildBriefs)
    .where(and(eq(buildBriefs.initiativeId, initiativeId), eq(buildBriefs.status, "ready")))
    .orderBy(desc(buildBriefs.version))
    .limit(1);
  if (!row) return null;
  const brief = parseBrief(row.content);
  return brief ? { row, brief } : null;
}

export async function listBuildUpdates(initiativeId: string, limit = 20) {
  return db
    .select({ update: buildUpdates, author: user.name })
    .from(buildUpdates)
    .leftJoin(user, eq(user.id, buildUpdates.createdById))
    .where(eq(buildUpdates.initiativeId, initiativeId))
    .orderBy(desc(buildUpdates.createdAt))
    .limit(limit);
}

export async function recordBuildUpdate(input: {
  orgId: string;
  initiativeId: string;
  userId: string | null;
  status: (typeof buildUpdates.status.enumValues)[number];
  message: string;
  link: string | null;
  source: "mcp" | "app";
}) {
  const [row] = await db
    .insert(buildUpdates)
    .values({
      orgId: input.orgId,
      initiativeId: input.initiativeId,
      createdById: input.userId,
      status: input.status,
      message: input.message,
      link: input.link,
      source: input.source,
    })
    .returning();
  await db.insert(activityLog).values({
    orgId: input.orgId,
    userId: input.userId,
    initiativeId: input.initiativeId,
    action: "build.progress",
    detail: { status: input.status, message: input.message.slice(0, 200), via: input.source },
  });
  return row;
}
