import "server-only";
import { and, arrayOverlaps, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { companies, entities, entityFacts, stories, storyEntities, storyLinks, type Story } from "@/db/schema";
import { DEADLINE_PREDICATES, type FactPredicate } from "./entities";
import { getCompanyStack, type StackItem } from "./stack";

export type StackContext = {
  domain: string;
  companyName: string;
  items: StackItem[];
  entityIds: string[];
  vendorSlugs: string[];
};

/** The signed-in user's company stack, if they joined with a work email. */
export async function getStackContext(u: { companyDomain: string | null; company: string | null }): Promise<StackContext | null> {
  if (!u.companyDomain) return null;
  const [[company], items] = await Promise.all([
    db.select({ name: companies.name }).from(companies).where(eq(companies.domain, u.companyDomain)).limit(1),
    getCompanyStack(u.companyDomain),
  ]);
  return {
    domain: u.companyDomain,
    companyName: u.company ?? company?.name ?? u.companyDomain,
    items,
    entityIds: items.map((i) => i.entity.id),
    vendorSlugs: [...new Set(items.map((i) => i.entity.vendorSlug).filter((v): v is string => Boolean(v)))],
  };
}

/**
 * Why each story is relevant to the company: "Because Acme uses Salesforce".
 * Direct entity matches beat vendor-level matches; confirmed stack items beat inferred ones.
 */
export async function stackReasons(storyList: Pick<Story, "id" | "vendors">[], ctx: StackContext | null): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  if (!ctx || ctx.items.length === 0 || storyList.length === 0) return reasons;
  const rank = (i: StackItem) => (i.status === "confirmed" ? 2 : 1) + i.confidence;
  const byEntity = new Map(ctx.items.map((i) => [i.entity.id, i]));
  const direct = await db
    .select({ storyId: storyEntities.storyId, entityId: storyEntities.entityId })
    .from(storyEntities)
    .where(and(inArray(storyEntities.storyId, storyList.map((s) => s.id)), inArray(storyEntities.entityId, ctx.entityIds)));
  const best = new Map<string, StackItem>();
  for (const d of direct) {
    const item = byEntity.get(d.entityId);
    if (item && (!best.has(d.storyId) || rank(best.get(d.storyId)!) < rank(item))) best.set(d.storyId, item);
  }
  for (const s of storyList) {
    if (best.has(s.id)) continue;
    const viaVendor = ctx.items.filter((i) => i.entity.vendorSlug && s.vendors.includes(i.entity.vendorSlug)).sort((a, b) => rank(b) - rank(a))[0];
    if (viaVendor) best.set(s.id, viaVendor);
  }
  for (const [storyId, item] of best) reasons.set(storyId, `Because ${ctx.companyName} uses ${item.entity.name}`);
  return reasons;
}

/**
 * Feed/digest relevance from the company stack, OR-ed into the reader's interests:
 * any story about a specific product/system in the stack, plus notable (importance ≥ 3) stories
 * about a stack vendor. Broad vendors (Google, Microsoft…) would otherwise flood the feed.
 */
export function stackRelevance(ctx: StackContext | null): SQL | undefined {
  if (!ctx) return undefined;
  const specific = ctx.items.filter((i) => i.entity.kind !== "vendor").map((i) => i.entity.id);
  const parts: SQL[] = [];
  const touching = storiesTouchingEntities(specific);
  if (touching) parts.push(touching);
  if (ctx.vendorSlugs.length) parts.push(and(arrayOverlaps(stories.vendors, ctx.vendorSlugs), gte(stories.importance, 3))!);
  return parts.length ? or(...parts) : undefined;
}

/** Stories touching any of these entities (for OR-ing into a feed query). */
export function storiesTouchingEntities(entityIds: string[]): SQL | undefined {
  if (!entityIds.length) return undefined;
  return inArray(
    stories.id,
    db.select({ id: storyEntities.storyId }).from(storyEntities).where(inArray(storyEntities.entityId, entityIds)),
  );
}

export type Deadline = {
  factId: string;
  predicate: FactPredicate;
  date: string;
  entityId: string;
  entityName: string;
  entityKind: string;
  vendorSlug: string | null;
  storySlug: string | null;
  storyTitle: string | null;
  inStack: boolean;
};

const DEADLINE_LABEL: Partial<Record<FactPredicate, string>> = {
  retires_on: "retires",
  deprecated_on: "is deprecated",
  effective_on: "takes effect",
};
export const deadlineLabel = (p: FactPredicate) => DEADLINE_LABEL[p] ?? "changes";

/**
 * Upcoming dated changes for things the reader cares about: their stack's products/vendors,
 * vendors they follow, and (optionally) regulation.
 */
export async function upcomingDeadlines(opts: {
  entityIds?: string[];
  vendorSlugs?: string[];
  includeRegulation?: boolean;
  days?: number;
  limit?: number;
}): Promise<Deadline[]> {
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + (opts.days ?? 180) * 864e5).toISOString().slice(0, 10);
  const scope: SQL[] = [];
  if (opts.entityIds?.length) scope.push(inArray(entityFacts.subjectId, opts.entityIds));
  if (opts.vendorSlugs?.length) scope.push(inArray(entities.vendorSlug, opts.vendorSlugs));
  if (opts.includeRegulation) scope.push(eq(entities.kind, "regulation"));
  if (!scope.length) return [];
  const rows = await db
    .select({
      factId: entityFacts.id,
      predicate: entityFacts.predicate,
      date: entityFacts.validFrom,
      entityId: entities.id,
      entityName: entities.name,
      entityKind: entities.kind,
      vendorSlug: entities.vendorSlug,
      storySlug: stories.slug,
      storyTitle: stories.title,
    })
    .from(entityFacts)
    .innerJoin(entities, eq(entities.id, entityFacts.subjectId))
    .leftJoin(stories, eq(stories.id, entityFacts.storyId))
    .where(
      and(
        inArray(entityFacts.predicate, DEADLINE_PREDICATES),
        isNull(entityFacts.supersededById),
        gte(entityFacts.validFrom, today),
        lte(entityFacts.validFrom, until),
        or(...scope),
      ),
    )
    .orderBy(entityFacts.validFrom)
    .limit(opts.limit ?? 8);
  const stackIds = new Set(opts.entityIds ?? []);
  const stackVendors = new Set(opts.vendorSlugs ?? []);
  return rows
    .filter((r): r is typeof r & { date: string } => r.date !== null)
    .map((r) => ({ ...r, inStack: stackIds.has(r.entityId) || (r.vendorSlug ? stackVendors.has(r.vendorSlug) : false) }));
}

export function daysUntil(date: string, now = new Date()): number {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 864e5);
}

/** Everything the graph knows around a story: its entities' fact history, related stories and arcs. */
export async function storyContext(storyId: string) {
  const ents = await db
    .select({ entity: entities })
    .from(storyEntities)
    .innerJoin(entities, eq(entities.id, storyEntities.entityId))
    .where(eq(storyEntities.storyId, storyId));
  // Prefer specific things over vendors for the timeline.
  const specific = ents.map((e) => e.entity).sort((a, b) => Number(a.kind === "vendor") - Number(b.kind === "vendor"));
  const focus = specific.slice(0, 3);
  const focusIds = focus.map((e) => e.id);
  const objectEntity = alias(entities, "object_entity");

  const [facts, timeline, links] = await Promise.all([
    focusIds.length
      ? db
          .select({
            fact: entityFacts,
            subjectName: entities.name,
            objectName: objectEntity.name,
            storySlug: stories.slug,
          })
          .from(entityFacts)
          .innerJoin(entities, eq(entities.id, entityFacts.subjectId))
          .leftJoin(objectEntity, eq(objectEntity.id, entityFacts.objectId))
          .leftJoin(stories, eq(stories.id, entityFacts.storyId))
          .where(inArray(entityFacts.subjectId, focusIds))
          .orderBy(desc(entityFacts.observedAt))
          .limit(20)
      : Promise.resolve([]),
    focus.some((e) => e.kind !== "vendor")
      ? db
          .selectDistinct({ id: stories.id, slug: stories.slug, title: stories.title, publishedAt: stories.publishedAt })
          .from(storyEntities)
          .innerJoin(stories, eq(stories.id, storyEntities.storyId))
          .where(
            and(
              inArray(storyEntities.entityId, focus.filter((e) => e.kind !== "vendor").map((e) => e.id)),
              eq(stories.status, "published"),
              sql`${stories.id} <> ${storyId}`,
              gte(stories.publishedAt, new Date(Date.now() - 365 * 864e5)),
            ),
          )
          .orderBy(desc(stories.publishedAt))
          .limit(8)
      : Promise.resolve([]),
    db
      .select({ kind: storyLinks.kind, direction: sql<"earlier" | "later">`case when ${storyLinks.storyId} = ${storyId} then 'earlier' else 'later' end`, slug: stories.slug, title: stories.title, publishedAt: stories.publishedAt })
      .from(storyLinks)
      .innerJoin(stories, sql`${stories.id} = case when ${storyLinks.storyId} = ${storyId} then ${storyLinks.relatedStoryId} else ${storyLinks.storyId} end`)
      .where(or(eq(storyLinks.storyId, storyId), eq(storyLinks.relatedStoryId, storyId))),
  ]);
  return { entities: specific, facts, timeline, links };
}
