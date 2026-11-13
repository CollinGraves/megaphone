import { and, arrayOverlaps, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  articles,
  ingestionRuns,
  initiativeAlerts,
  initiatives,
  sources,
  stories,
  type Source,
  type Story,
} from "@/db/schema";
import { chunk, pMap } from "@/lib/concurrency";
import { hasAnthropic } from "@/lib/env";
import { ALERT_CATEGORIES, categoryLabel, vendorLabel } from "@/lib/taxonomy";
import { fetchSourceItems } from "./fetch";
import {
  clampImportance,
  coverageBoost,
  detectCategories,
  detectIndustries,
  detectVendors,
  heuristicImportance,
  isAiRelevant,
  slugify,
  titleSimilarity,
} from "./heuristics";
import { classifyBatch, type CandidateStory } from "./llm";
import { truncate } from "./parse";

const LLM_BATCH_SIZE = 25;
const CANDIDATE_WINDOW_DAYS = 4;
const SIMILARITY_THRESHOLD = 0.5;

export type IngestStats = {
  sourcesFetched: number;
  sourcesFailed: number;
  articlesAdded: number;
  articlesProcessed: number;
  articlesIrrelevant: number;
  storiesCreated: number;
  storiesUpdated: number;
  alertsCreated: number;
  llmBatches: number;
  llmFailures: number;
};

const emptyStats = (): IngestStats => ({
  sourcesFetched: 0,
  sourcesFailed: 0,
  articlesAdded: 0,
  articlesProcessed: 0,
  articlesIrrelevant: 0,
  storiesCreated: 0,
  storiesUpdated: 0,
  alertsCreated: 0,
  llmBatches: 0,
  llmFailures: 0,
});

/* ───────────────────────────── Step 1: fetch ───────────────────────────── */

export async function fetchSources(stats: IngestStats, opts: { sourceIds?: string[] } = {}) {
  const list = await db
    .select()
    .from(sources)
    .where(opts.sourceIds?.length ? inArray(sources.id, opts.sourceIds) : eq(sources.active, true));

  await pMap(list, 6, async (source) => {
    const now = new Date();
    try {
      const items = await fetchSourceItems(source);
      const relevant = source.aiOnly ? items : items.filter((i) => isAiRelevant(`${i.title} ${i.excerpt ?? ""}`));
      if (relevant.length) {
        const inserted = await db
          .insert(articles)
          .values(
            relevant.map((i) => ({
              sourceId: source.id,
              url: i.url,
              title: truncate(i.title, 300),
              excerpt: i.excerpt,
              author: i.author ? truncate(i.author, 120) : null,
              publishedAt: i.publishedAt && i.publishedAt <= now ? i.publishedAt : now,
            })),
          )
          .onConflictDoNothing({ target: articles.url })
          .returning({ id: articles.id });
        stats.articlesAdded += inserted.length;
      }
      stats.sourcesFetched++;
      await db
        .update(sources)
        .set({ lastFetchedAt: now, lastSuccessAt: now, lastError: null, consecutiveFailures: 0 })
        .where(eq(sources.id, source.id));
    } catch (err) {
      stats.sourcesFailed++;
      await db
        .update(sources)
        .set({
          lastFetchedAt: now,
          lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
          consecutiveFailures: sql`${sources.consecutiveFailures} + 1`,
        })
        .where(eq(sources.id, source.id));
    }
  });
}

/* ─────────────────────── Step 2: dedupe + classify ─────────────────────── */

type PendingArticle = {
  id: string;
  url: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date;
  source: Pick<Source, "name" | "authority" | "vendor" | "defaultCategory" | "aiOnly">;
};

type Candidate = CandidateStory & { publishedAt: Date; articleCount: number; importance: number };

async function loadCandidates(): Promise<Candidate[]> {
  const since = new Date(Date.now() - CANDIDATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: stories.id,
      title: stories.title,
      summary: stories.summary,
      publishedAt: stories.publishedAt,
      articleCount: stories.articleCount,
      importance: stories.importance,
    })
    .from(stories)
    .where(gte(stories.publishedAt, since))
    .orderBy(desc(stories.publishedAt))
    .limit(250);
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  const [existing] = await db.select({ id: stories.id }).from(stories).where(eq(stories.slug, base)).limit(1);
  if (!existing) return base;
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

async function createStory(input: {
  title: string;
  summary: string;
  whyItMatters: string | null;
  categories: string[];
  vendors: string[];
  industries: string[];
  importance: number;
  members: PendingArticle[];
  classifiedBy: "llm" | "heuristic";
}): Promise<Story> {
  const primary = [...input.members].sort(
    (a, b) => b.source.authority - a.source.authority || a.publishedAt.getTime() - b.publishedAt.getTime(),
  )[0];
  const publishedAt = new Date(Math.min(...input.members.map((m) => m.publishedAt.getTime())));
  const [story] = await db
    .insert(stories)
    .values({
      slug: await uniqueSlug(input.title),
      title: truncate(input.title, 200),
      summary: input.summary,
      whyItMatters: input.whyItMatters,
      categories: [...new Set(input.categories)],
      vendors: [...new Set(input.vendors)],
      industries: [...new Set(input.industries)],
      importance: clampImportance(input.importance),
      primaryUrl: primary.url,
      primarySourceName: primary.source.name,
      articleCount: input.members.length,
      classifiedBy: input.classifiedBy,
      publishedAt,
    })
    .returning();
  await db
    .update(articles)
    .set({ storyId: story.id, processedAt: new Date() })
    .where(inArray(articles.id, input.members.map((m) => m.id)));
  return story;
}

async function attachToStory(storyId: string, members: PendingArticle[]) {
  const [updated] = await db
    .update(stories)
    .set({ articleCount: sql`${stories.articleCount} + ${members.length}` })
    .where(eq(stories.id, storyId))
    .returning();
  // Broad coverage is a signal: bump importance when coverage crosses a threshold.
  if (updated) {
    const before = coverageBoost(updated.articleCount - members.length);
    const after = coverageBoost(updated.articleCount);
    if (after > before && updated.importance < 5) {
      await db
        .update(stories)
        .set({ importance: Math.min(5, updated.importance + 1) })
        .where(eq(stories.id, storyId));
    }
  }
  await db
    .update(articles)
    .set({ storyId, processedAt: new Date() })
    .where(inArray(articles.id, members.map((m) => m.id)));
}

async function markIrrelevant(ids: string[]) {
  if (!ids.length) return;
  await db.update(articles).set({ processedAt: new Date() }).where(inArray(articles.id, ids));
}

async function processHeuristically(batch: PendingArticle[], candidates: Candidate[], stats: IngestStats, touched: Set<string>) {
  for (const article of batch) {
    const text = `${article.title} ${article.excerpt ?? ""}`;
    if (!article.source.aiOnly && !isAiRelevant(text)) {
      await markIrrelevant([article.id]);
      stats.articlesIrrelevant++;
      continue;
    }
    let best: Candidate | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = titleSimilarity(article.title, c.title);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best && bestScore >= SIMILARITY_THRESHOLD) {
      await attachToStory(best.id, [article]);
      touched.add(best.id);
      stats.storiesUpdated++;
    } else {
      const categories = detectCategories(text, article.source.defaultCategory);
      const vendors = [...new Set([...detectVendors(text), ...(article.source.vendor ? [article.source.vendor] : [])])];
      const story = await createStory({
        title: article.title,
        summary: article.excerpt ? truncate(article.excerpt, 320) : article.title,
        whyItMatters: null,
        categories,
        vendors,
        industries: detectIndustries(text),
        importance: heuristicImportance({ authority: article.source.authority, categories, vendors, articleCount: 1 }),
        members: [article],
        classifiedBy: "heuristic",
      });
      candidates.unshift({ ...story, articleCount: 1 });
      touched.add(story.id);
      stats.storiesCreated++;
    }
    stats.articlesProcessed++;
  }
}

async function processWithModel(batch: PendingArticle[], candidates: Candidate[], stats: IngestStats, touched: Set<string>) {
  stats.llmBatches++;
  const result = await classifyBatch(
    batch.map((a) => ({ id: a.id, source: a.source.name, title: a.title, excerpt: a.excerpt, publishedAt: a.publishedAt })),
    candidates.slice(0, 150).map((c) => ({ id: c.id, title: c.title, summary: truncate(c.summary, 200) })),
  );

  const byId = new Map(batch.map((a) => [a.id, a]));
  const candidateIds = new Set(candidates.map((c) => c.id));
  const groups = new Map(result.new_stories.map((g) => [g.group_key, g]));
  const toExisting = new Map<string, PendingArticle[]>();
  const toNew = new Map<string, PendingArticle[]>();
  const irrelevant: string[] = [];
  const handled = new Set<string>();

  for (const a of result.articles) {
    const article = byId.get(a.article_id);
    if (!article || handled.has(article.id)) continue;
    handled.add(article.id);
    if (!a.relevant || a.assignment === "none") irrelevant.push(article.id);
    else if (candidateIds.has(a.assignment)) toExisting.set(a.assignment, [...(toExisting.get(a.assignment) ?? []), article]);
    else if (groups.has(a.assignment)) toNew.set(a.assignment, [...(toNew.get(a.assignment) ?? []), article]);
    else handled.delete(article.id); // unknown reference → heuristic fallback below
  }

  await markIrrelevant(irrelevant);
  stats.articlesIrrelevant += irrelevant.length;
  stats.articlesProcessed += irrelevant.length;

  for (const [storyId, members] of toExisting) {
    await attachToStory(storyId, members);
    touched.add(storyId);
    stats.storiesUpdated++;
    stats.articlesProcessed += members.length;
  }

  for (const [key, members] of toNew) {
    const g = groups.get(key)!;
    const authority = Math.max(...members.map((m) => m.source.authority));
    const story = await createStory({
      title: g.title,
      summary: g.summary,
      whyItMatters: g.why_it_matters,
      categories: g.categories.length ? g.categories : ["product_launch"],
      vendors: g.vendors,
      industries: g.industries,
      // Model judgement, nudged by coverage breadth and first-party authority.
      importance: g.importance + (members.length >= 4 ? 1 : 0) + (authority >= 5 && g.importance >= 3 ? 0.4 : 0),
      members,
      classifiedBy: "llm",
    });
    candidates.unshift({ ...story });
    candidateIds.add(story.id);
    touched.add(story.id);
    stats.storiesCreated++;
    stats.articlesProcessed += members.length;
  }

  const leftovers = batch.filter((a) => !handled.has(a.id));
  if (leftovers.length) await processHeuristically(leftovers, candidates, stats, touched);
}

export async function processPendingArticles(stats: IngestStats, opts: { limit?: number } = {}) {
  const pending: PendingArticle[] = (
    await db
      .select({
        id: articles.id,
        url: articles.url,
        title: articles.title,
        excerpt: articles.excerpt,
        publishedAt: articles.publishedAt,
        sourceName: sources.name,
        authority: sources.authority,
        vendor: sources.vendor,
        defaultCategory: sources.defaultCategory,
        aiOnly: sources.aiOnly,
      })
      .from(articles)
      .innerJoin(sources, eq(articles.sourceId, sources.id))
      .where(isNull(articles.processedAt))
      .orderBy(articles.publishedAt)
      .limit(opts.limit ?? 300)
  ).map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    excerpt: r.excerpt,
    publishedAt: r.publishedAt,
    source: { name: r.sourceName, authority: r.authority, vendor: r.vendor, defaultCategory: r.defaultCategory, aiOnly: r.aiOnly },
  }));
  if (pending.length === 0) return new Set<string>();

  const candidates = await loadCandidates();
  const touched = new Set<string>();
  const useModel = hasAnthropic();

  for (const batch of chunk(pending, LLM_BATCH_SIZE)) {
    if (useModel) {
      try {
        await processWithModel(batch, candidates, stats, touched);
        continue;
      } catch (err) {
        stats.llmFailures++;
        console.error("[ingest] model classification failed, using heuristics:", err);
        // Only articles the model run didn't already store fall through.
        const stillPending = await db
          .select({ id: articles.id })
          .from(articles)
          .where(and(inArray(articles.id, batch.map((b) => b.id)), isNull(articles.processedAt)));
        const ids = new Set(stillPending.map((p) => p.id));
        await processHeuristically(batch.filter((b) => ids.has(b.id)), candidates, stats, touched);
        continue;
      }
    }
    await processHeuristically(batch, candidates, stats, touched);
  }
  return touched;
}

/* ─────────────────── Step 3: connect Radar → Workspace ─────────────────── */

/**
 * When a high-signal story (pricing, deprecation, security…) hits a vendor that an
 * initiative is built on, raise an alert inside that client's workspace.
 */
export async function generateInitiativeAlerts(storyIds: Iterable<string>): Promise<number> {
  const ids = [...storyIds];
  if (!ids.length) return 0;
  const candidates = await db
    .select()
    .from(stories)
    .where(
      and(
        inArray(stories.id, ids),
        gte(stories.importance, 3),
        eq(stories.status, "published"),
        arrayOverlaps(stories.categories, ALERT_CATEGORIES),
      ),
    );
  let created = 0;
  for (const story of candidates) {
    if (!story.vendors.length) continue;
    const affected = await db
      .select({ id: initiatives.id, orgId: initiatives.orgId, platforms: initiatives.platforms })
      .from(initiatives)
      .where(
        and(
          isNull(initiatives.archivedAt),
          ne(initiatives.stage, "retired"),
          arrayOverlaps(initiatives.platforms, story.vendors),
        ),
      );
    if (!affected.length) continue;
    const category = story.categories.find((c) => (ALERT_CATEGORIES as string[]).includes(c)) ?? story.categories[0];
    const rows = affected.map((i) => {
      const vendors = i.platforms.filter((p) => story.vendors.includes(p)).map(vendorLabel);
      return {
        orgId: i.orgId,
        initiativeId: i.id,
        storyId: story.id,
        reason: `${categoryLabel(category)} news for ${vendors.join(", ")}, a platform this initiative is built on.`,
      };
    });
    const inserted = await db.insert(initiativeAlerts).values(rows).onConflictDoNothing().returning({ id: initiativeAlerts.id });
    created += inserted.length;
  }
  return created;
}

/* ───────────────────────────── Orchestration ───────────────────────────── */

export async function runIngestion(opts: { trigger: string; sourceIds?: string[]; skipFetch?: boolean }) {
  const stats = emptyStats();
  const [run] = await db.insert(ingestionRuns).values({ trigger: opts.trigger }).returning();
  try {
    if (!opts.skipFetch) await fetchSources(stats, { sourceIds: opts.sourceIds });
    const touched = await processPendingArticles(stats);
    stats.alertsCreated = await generateInitiativeAlerts(touched);
    await db.update(ingestionRuns).set({ finishedAt: new Date(), stats }).where(eq(ingestionRuns.id, run.id));
    return stats;
  } catch (err) {
    await db
      .update(ingestionRuns)
      .set({ finishedAt: new Date(), stats, error: err instanceof Error ? err.message : String(err) })
      .where(eq(ingestionRuns.id, run.id));
    throw err;
  }
}
