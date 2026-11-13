import "server-only";
import { and, arrayOverlaps, desc, eq, gte, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { articles, savedStories, sources, stories, type Story } from "@/db/schema";

export type StoryFilters = {
  categories?: string[];
  vendors?: string[];
  industries?: string[];
  /** When true, a story matches if it hits ANY of the selected categories/vendors/industries. */
  matchAny?: boolean;
  minImportance?: number;
  sinceDays?: number;
  search?: string;
  featuredOnly?: boolean;
  limit?: number;
  offset?: number;
  order?: "recent" | "top";
};

function buildWhere(f: StoryFilters): SQL | undefined {
  const clauses: (SQL | undefined)[] = [eq(stories.status, "published")];
  if (f.minImportance) clauses.push(gte(stories.importance, f.minImportance));
  if (f.sinceDays) clauses.push(gte(stories.publishedAt, new Date(Date.now() - f.sinceDays * 864e5)));
  if (f.featuredOnly) clauses.push(eq(stories.featured, true));
  if (f.search) {
    const q = `%${f.search.replace(/[%_]/g, "")}%`;
    clauses.push(or(ilike(stories.title, q), ilike(stories.summary, q)));
  }
  const interest: SQL[] = [];
  if (f.categories?.length) interest.push(arrayOverlaps(stories.categories, f.categories));
  if (f.vendors?.length) interest.push(arrayOverlaps(stories.vendors, f.vendors));
  if (f.industries?.length) interest.push(arrayOverlaps(stories.industries, f.industries));
  if (interest.length) clauses.push(f.matchAny ? or(...interest) : and(...interest));
  return and(...clauses);
}

export async function listStories(f: StoryFilters = {}): Promise<Story[]> {
  const order =
    f.order === "top"
      ? [desc(stories.featured), desc(stories.importance), desc(stories.articleCount), desc(stories.publishedAt)]
      : [desc(stories.publishedAt)];
  return db
    .select()
    .from(stories)
    .where(buildWhere(f))
    .orderBy(...order)
    .limit(f.limit ?? 30)
    .offset(f.offset ?? 0);
}

export async function countStories(f: StoryFilters = {}): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(stories).where(buildWhere(f));
  return row?.n ?? 0;
}

export async function getStoryBySlug(slug: string) {
  const [story] = await db.select().from(stories).where(eq(stories.slug, slug)).limit(1);
  if (!story || story.status !== "published") return null;
  const coverage = await db
    .select({
      id: articles.id,
      url: articles.url,
      title: articles.title,
      publishedAt: articles.publishedAt,
      sourceName: sources.name,
      authority: sources.authority,
    })
    .from(articles)
    .innerJoin(sources, eq(articles.sourceId, sources.id))
    .where(eq(articles.storyId, story.id))
    .orderBy(desc(sources.authority), articles.publishedAt)
    .limit(25);
  return { story, coverage };
}

export async function getRelatedStories(story: Story, limit = 4): Promise<Story[]> {
  const interest: SQL[] = [];
  if (story.vendors.length) interest.push(arrayOverlaps(stories.vendors, story.vendors));
  if (story.categories.length) interest.push(arrayOverlaps(stories.categories, story.categories));
  if (!interest.length) return [];
  return db
    .select()
    .from(stories)
    .where(
      and(
        eq(stories.status, "published"),
        ne(stories.id, story.id),
        gte(stories.publishedAt, new Date(story.publishedAt.getTime() - 21 * 864e5)),
        or(...interest),
      ),
    )
    .orderBy(desc(stories.importance), desc(stories.publishedAt))
    .limit(limit);
}

export async function savedStoryIds(userId: string, storyIds: string[]): Promise<Set<string>> {
  if (!storyIds.length) return new Set();
  const rows = await db
    .select({ storyId: savedStories.storyId })
    .from(savedStories)
    .where(and(eq(savedStories.userId, userId), inArray(savedStories.storyId, storyIds)));
  return new Set(rows.map((r) => r.storyId));
}

export async function listSavedStories(userId: string, limit = 50): Promise<Story[]> {
  const rows = await db
    .select({ story: stories })
    .from(savedStories)
    .innerJoin(stories, eq(savedStories.storyId, stories.id))
    .where(eq(savedStories.userId, userId))
    .orderBy(desc(savedStories.createdAt))
    .limit(limit);
  return rows.map((r) => r.story);
}

/** Counts per category over a window, for topic navigation. */
export async function categoryCounts(sinceDays = 7): Promise<Record<string, number>> {
  const rows = await db.execute<{ category: string; n: number }>(sql`
    select unnest(categories) as category, count(*)::int as n
    from ${stories}
    where status = 'published' and published_at >= now() - make_interval(days => ${sinceDays})
    group by 1`);
  return Object.fromEntries(rows.map((r) => [r.category, r.n]));
}
