import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { episodes, impactMetrics, initiatives, organizations, stories, type Episode, type Story } from "@/db/schema";
import { SHOW_NAME } from "@/lib/brand";
import type { BriefContext } from "@/lib/build/context";
import { generateBriefForContext } from "@/lib/build/server";
import { diversify } from "@/lib/digest";
import { hasAnthropic } from "@/lib/env";
import { deadlineLabel, upcomingDeadlines } from "@/lib/graph/personalize";
import { annualize } from "@/lib/impact";
import { DEFAULT_MODEL } from "@/lib/ingest/llm";
import { listStories } from "@/lib/stories";
import { VENDOR_SLUGS, vendorLabel } from "@/lib/taxonomy";
import { formatDate } from "@/lib/utils";
import {
  assembleRundown,
  buildLiveSegment,
  NewsPrepSchema,
  parseRundown,
  storyIdsOf,
  summarizeInsights,
  templateNewsPrep,
  type InsightOrg,
  type NewsPrep,
  type PrepStory,
} from "./rundown";

const SYSTEM_PROMPT = `You write show prep for ${SHOW_NAME}, a lively AI news show for mid-market operators: COOs, IT and operations leaders at 200–2,000 person companies who have to make AI actually work. Think sports-talk energy applied to AI: punchy, conversational, opinionated, funny where it fits, never hype.

Rules:
- Use only facts in the provided stories. Never invent numbers, quotes, dates or product details; where something is unclear, say the host should flag it.
- Hot takes are defensible opinions the host can argue on air, not insults about people or companies.
- Explain jargon in a line. Every story needs a "so what" for a mid-market company.
- Talking points are short spoken lines, not paragraphs.
- Return exactly one entry per story, using the story_id given, in the same order.`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const toPrepStory = (s: Story): PrepStory => ({
  id: s.id,
  slug: s.slug,
  title: s.title,
  summary: s.summary,
  whyItMatters: s.whyItMatters,
  importance: s.importance,
  vendors: s.vendors,
  articleCount: s.articleCount,
});

/** The strongest stories in the window, varied across vendors and sources. */
export async function pickStories(opts: { sinceDays: number; count: number }) {
  const pool = await listStories({ sinceDays: opts.sinceDays, order: "top", limit: 80, minImportance: 2 });
  return diversify(pool, opts.count);
}

async function writeNewsPrep(list: PrepStory[], airDate: string): Promise<{ prep: NewsPrep; generator: string }> {
  if (!hasAnthropic() || !list.length) return { prep: templateNewsPrep(list), generator: "template" };
  const model = process.env.AI_RADAR_BRIEF_MODEL || process.env.AI_RADAR_MODEL || DEFAULT_MODEL;
  const body = list
    .map(
      (s) =>
        `<story id="${s.id}">\nTitle: ${s.title}\nSummary: ${s.summary}\nWhy it matters: ${s.whyItMatters ?? "—"}\nVendors: ${s.vendors.map(vendorLabel).join(", ") || "—"}\nImportance: ${s.importance}/5 · covered by ${s.articleCount} outlet(s)\n</story>`,
    )
    .join("\n");
  const response = await getClient().beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(NewsPrepSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Episode airs ${airDate}. Write the prep for these stories, in this order.\n\n<stories>\n${body}\n</stories>` }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined to write this prep.");
  if (response.stop_reason === "max_tokens") throw new Error("The prep was too long to finish. Try fewer stories.");
  if (!response.parsed_output) throw new Error("The model's prep couldn't be read.");
  return { prep: response.parsed_output, generator: response.model ?? model };
}

async function deadlineLines(): Promise<string[]> {
  const rows = await upcomingDeadlines({ vendorSlugs: VENDOR_SLUGS, includeRegulation: true, days: 60, limit: 6 });
  return rows.map((d) => `${d.entityName} ${deadlineLabel(d.predicate)} on ${formatDate(d.date)}`);
}

/** Generate (or regenerate) the news part of an episode's rundown, keeping other segments. */
export async function runEpisodePrep(episodeId: string) {
  const [ep] = await db.select().from(episodes).where(eq(episodes.id, episodeId)).limit(1);
  if (!ep || ep.prepStatus !== "generating") return;
  try {
    const rows = ep.storyIds.length ? await db.select().from(stories).where(inArray(stories.id, ep.storyIds)) : [];
    const byId = new Map(rows.map((s) => [s.id, s]));
    const list = ep.storyIds.map((id) => byId.get(id)).filter((s): s is Story => !!s).map(toPrepStory);
    const [{ prep, generator }, deadlines] = await Promise.all([writeNewsPrep(list, ep.airDate), deadlineLines()]);
    const rundown = assembleRundown({ prep, stories: list, deadlines, generator, previous: parseRundown(ep.rundown) });
    await db
      .update(episodes)
      .set({ rundown: rundown as unknown as Record<string, unknown>, storyIds: storyIdsOf(rundown), prepStatus: "ready", prepError: null })
      .where(eq(episodes.id, ep.id));
  } catch (err) {
    console.error("[show] prep failed", err);
    await db
      .update(episodes)
      .set({ prepStatus: "failed", prepError: err instanceof Error ? err.message.slice(0, 500) : "Prep failed" })
      .where(eq(episodes.id, ep.id));
  }
}

function schedulePrep(id: string) {
  try {
    after(() => runEpisodePrep(id));
  } catch {
    return runEpisodePrep(id);
  }
}

export async function createEpisode(opts: { airDate: string; sinceDays: number; count: number; userId: string }): Promise<Episode> {
  const picked = await pickStories(opts);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${episodes.number}), 0)::int` }).from(episodes);
  const number = max + 1;
  const [ep] = await db
    .insert(episodes)
    .values({
      number,
      slug: `episode-${number}`,
      title: `Episode ${number}`,
      airDate: opts.airDate,
      storyIds: picked.map((s) => s.id),
      prepStatus: "generating",
      createdById: opts.userId,
    })
    .returning();
  await schedulePrep(ep.id);
  return ep;
}

/** Re-pick the news for an episode and regenerate its news segments. */
export async function refreshEpisodeNews(ep: Episode, opts: { sinceDays: number; count: number }) {
  const picked = await pickStories(opts);
  await db.update(episodes).set({ storyIds: picked.map((s) => s.id), prepStatus: "generating", prepError: null }).where(eq(episodes.id, ep.id));
  await schedulePrep(ep.id);
}

/** Aggregate stats across workspaces that opted in to sharing them. */
export async function loadInsights() {
  const orgRows = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.shareAggregateInsights, true));
  if (!orgRows.length) return summarizeInsights([]);
  const ids = orgRows.map((o) => o.id);
  const inits = await db
    .select({ id: initiatives.id, orgId: initiatives.orgId, stage: initiatives.stage, platforms: initiatives.platforms, riskTier: initiatives.riskTier })
    .from(initiatives)
    .where(and(inArray(initiatives.orgId, ids), isNull(initiatives.archivedAt)));
  const metrics = inits.length
    ? await db
        .select({ initiativeId: impactMetrics.initiativeId, value: impactMetrics.estimatedValue, period: impactMetrics.period })
        .from(impactMetrics)
        .where(and(inArray(impactMetrics.initiativeId, inits.map((i) => i.id)), eq(impactMetrics.type, "hours_saved")))
    : [];
  const hours = new Map<string, number>();
  for (const m of metrics) {
    if (m.value == null || m.period === "one_time") continue;
    hours.set(m.initiativeId, (hours.get(m.initiativeId) ?? 0) + annualize(m.value, m.period));
  }
  const byOrg = new Map<string, InsightOrg>(ids.map((id) => [id, { initiatives: [] }]));
  for (const i of inits) {
    byOrg.get(i.orgId)!.initiatives.push({ stage: i.stage, platforms: i.platforms, riskTier: i.riskTier, annualHours: hours.get(i.id) ?? null });
  }
  return summarizeInsights([...byOrg.values()]);
}

/** A "build it live" segment from a viewer's idea, using the same brief generator as workspaces. */
export async function buildLiveFromIdea(idea: {
  title: string;
  problem: string;
  team: string | null;
  stack: string[];
  systems: string[];
  riskTier: string;
  customerFacing: boolean;
}) {
  const context: BriefContext = {
    org: { name: "a viewer's company", industry: null, defaultHourlyRate: 75 },
    initiative: {
      title: idea.title,
      problem: idea.problem,
      solution: "",
      businessUnit: idea.team,
      stage: "idea",
      platforms: [],
      models: [],
      buildApproach: null,
      riskTier: idea.riskTier,
      customerFacing: idea.customerFacing,
      affectsIndividuals: null,
      humanOversight: null,
      targetDate: null,
    },
    metrics: [],
    dependencies: idea.systems.map((s) => ({ system: s, category: "other", vendor: null, data: `Records needed from ${s}`, access: "not_requested", sensitivity: "internal" })),
    portfolioPlatforms: idea.stack,
    systems: idea.systems.map((name) => ({ name, category: "other", vendor: null })),
    stack: idea.stack,
    guidance: "This brief will be walked through live on a show for a general business audience. Keep it practical and explain choices plainly.",
  };
  const { brief } = await generateBriefForContext(context);
  return buildLiveSegment({ title: idea.title, problem: idea.problem }, brief, `build-${crypto.randomUUID().slice(0, 8)}`);
}

export async function listEpisodes(opts: { publishedOnly?: boolean; limit?: number } = {}) {
  return db
    .select()
    .from(episodes)
    .where(opts.publishedOnly ? eq(episodes.status, "published") : undefined)
    .orderBy(desc(episodes.airDate), desc(episodes.number))
    .limit(opts.limit ?? 100);
}

export async function getPublishedEpisode(slug: string) {
  const [ep] = await db.select().from(episodes).where(and(eq(episodes.slug, slug), eq(episodes.status, "published"))).limit(1);
  return ep ?? null;
}

/** Stories in the episode's order. */
export async function episodeStories(ep: Pick<Episode, "storyIds">) {
  if (!ep.storyIds.length) return [];
  const rows = await db.select().from(stories).where(and(inArray(stories.id, ep.storyIds), eq(stories.status, "published")));
  const byId = new Map(rows.map((s) => [s.id, s]));
  return ep.storyIds.map((id) => byId.get(id)).filter((s): s is Story => !!s);
}

/** Published episodes that covered a story (for "discussed on the show" links). */
export async function episodesForStory(storyId: string) {
  return db
    .select({ slug: episodes.slug, number: episodes.number, title: episodes.title })
    .from(episodes)
    .where(and(eq(episodes.status, "published"), sql`${episodes.storyIds} @> ARRAY[${storyId}]::text[]`))
    .orderBy(desc(episodes.airDate))
    .limit(3);
}
