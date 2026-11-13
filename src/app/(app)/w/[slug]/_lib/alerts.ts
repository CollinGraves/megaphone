import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { initiativeAlerts, initiatives, stories } from "@/db/schema";

/** Open (non-dismissed) alerts on non-archived initiatives. */
const openAlerts = (orgId: string, initiativeId?: string) =>
  and(
    eq(initiativeAlerts.orgId, orgId),
    isNull(initiativeAlerts.dismissedAt),
    isNull(initiatives.archivedAt),
    initiativeId ? eq(initiativeAlerts.initiativeId, initiativeId) : undefined,
  );

export async function countOpenAlerts(orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(initiativeAlerts)
    .innerJoin(initiatives, eq(initiativeAlerts.initiativeId, initiatives.id))
    .where(openAlerts(orgId));
  return row?.n ?? 0;
}

export async function loadOpenAlerts(orgId: string, opts: { initiativeId?: string; limit?: number } = {}) {
  return db
    .select({
      id: initiativeAlerts.id,
      reason: initiativeAlerts.reason,
      createdAt: initiativeAlerts.createdAt,
      initiativeId: initiatives.id,
      initiativeTitle: initiatives.title,
      storySlug: stories.slug,
      storyTitle: stories.title,
      storySummary: stories.summary,
      storyImportance: stories.importance,
      storyPublishedAt: stories.publishedAt,
      storySource: stories.primarySourceName,
      storyCategories: stories.categories,
    })
    .from(initiativeAlerts)
    .innerJoin(initiatives, eq(initiativeAlerts.initiativeId, initiatives.id))
    .innerJoin(stories, eq(initiativeAlerts.storyId, stories.id))
    .where(openAlerts(orgId, opts.initiativeId))
    .orderBy(desc(stories.publishedAt))
    .limit(opts.limit ?? 200);
}

export type OpenAlert = Awaited<ReturnType<typeof loadOpenAlerts>>[number];
