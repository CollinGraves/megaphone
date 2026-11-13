import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { entities, entityFacts, entityKind, factPredicate, stories, storyEntities, storyLinks, type Entity, type EntityFact } from "@/db/schema";
import { slugify } from "@/lib/ingest/heuristics";
import { VENDORS, type VendorSlug } from "@/lib/taxonomy";

export type EntityKind = (typeof entityKind.enumValues)[number];
export type FactPredicate = (typeof factPredicate.enumValues)[number];

/** Predicates whose validFrom is a date people need to act before. */
export const DEADLINE_PREDICATES: FactPredicate[] = ["retires_on", "deprecated_on", "effective_on"];

export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Accepts YYYY-MM-DD (or a full ISO timestamp) and rejects anything implausible. */
export function parseFactDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3])) return null;
  const year = d.getUTCFullYear();
  if (year < 2015 || year > 2040) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

const vendorBySlug = new Map<string, (typeof VENDORS)[number]>(VENDORS.map((v) => [v.slug, v]));
const vendorByName = new Map<string, VendorSlug>(
  VENDORS.flatMap((v) => [
    [v.label.toLowerCase(), v.slug],
    [v.slug, v.slug],
    ...v.label.split(/\s*\/\s*/).map((part) => [part.toLowerCase(), v.slug] as [string, VendorSlug]),
  ]),
);

export function vendorSlugForName(name: string): VendorSlug | null {
  return vendorByName.get(name.trim().toLowerCase()) ?? null;
}

/** The canonical entity for a taxonomy vendor (created on first use). */
export async function ensureVendorEntity(slug: string): Promise<Entity | null> {
  const vendor = vendorBySlug.get(slug);
  if (!vendor) return null;
  const [row] = await db
    .insert(entities)
    .values({ kind: "vendor", slug: vendor.slug, name: vendor.label, vendorSlug: vendor.slug })
    .onConflictDoUpdate({ target: [entities.kind, entities.slug], set: { name: vendor.label } })
    .returning();
  return row;
}

/** Find an entity by name or alias (case-insensitive), optionally within a kind. */
export async function findEntityByName(name: string, kind?: EntityKind): Promise<Entity | null> {
  const n = normalizeName(name).toLowerCase();
  if (!n) return null;
  const vendorSlug = vendorSlugForName(n);
  if (vendorSlug && (!kind || kind === "vendor")) return ensureVendorEntity(vendorSlug);
  const [row] = await db
    .select()
    .from(entities)
    .where(
      and(
        kind ? eq(entities.kind, kind) : undefined,
        sql`(lower(${entities.name}) = ${n} or ${entities.slug} = ${slugify(n)} or ${n} = any(select lower(a) from unnest(${entities.aliases}) a))`,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function upsertEntity(input: { name: string; kind: EntityKind; vendorSlug?: string | null }): Promise<Entity | null> {
  const name = normalizeName(input.name);
  if (!name) return null;
  // Vendors always resolve to the taxonomy entry so all signals converge on one node.
  const asVendor = vendorSlugForName(name);
  if (input.kind === "vendor" || asVendor) {
    if (asVendor) return ensureVendorEntity(asVendor);
    if (input.kind === "vendor") input = { ...input, kind: "company" };
  }
  const existing = await findEntityByName(name, input.kind);
  if (existing) {
    if (!existing.vendorSlug && input.vendorSlug && vendorBySlug.has(input.vendorSlug)) {
      await db.update(entities).set({ vendorSlug: input.vendorSlug }).where(eq(entities.id, existing.id));
    }
    return existing;
  }
  const [row] = await db
    .insert(entities)
    .values({
      kind: input.kind,
      slug: slugify(name, 100),
      name,
      vendorSlug: input.vendorSlug && vendorBySlug.has(input.vendorSlug) ? input.vendorSlug : null,
    })
    .onConflictDoUpdate({ target: [entities.kind, entities.slug], set: { name } })
    .returning();
  return row;
}

export async function linkStoryEntities(storyId: string, entityIds: string[]) {
  const ids = [...new Set(entityIds)];
  if (!ids.length) return;
  await db
    .insert(storyEntities)
    .values(ids.map((entityId) => ({ storyId, entityId })))
    .onConflictDoNothing();
}

/** Link a story to the vendor entities it's tagged with (works for heuristic and model classification). */
export async function linkStoryVendors(storyId: string, vendorSlugs: string[]) {
  const ids: string[] = [];
  for (const slug of vendorSlugs) {
    const e = await ensureVendorEntity(slug);
    if (e) ids.push(e.id);
  }
  await linkStoryEntities(storyId, ids);
}

/**
 * Record a fact. If a current fact exists for the same subject/predicate/object and says something
 * different, it is closed (validTo) and points at the new fact (supersededById).
 */
export async function recordFact(input: {
  subjectId: string;
  predicate: FactPredicate;
  objectId?: string | null;
  value?: string | null;
  validFrom?: string | null;
  storyId?: string | null;
}): Promise<{ fact: EntityFact; superseded: EntityFact | null; duplicate: boolean }> {
  const objectId = input.objectId ?? null;
  const value = input.value ? input.value.trim().slice(0, 300) : null;
  const validFrom = input.validFrom ?? null;
  const [current] = await db
    .select()
    .from(entityFacts)
    .where(
      and(
        eq(entityFacts.subjectId, input.subjectId),
        eq(entityFacts.predicate, input.predicate),
        objectId ? eq(entityFacts.objectId, objectId) : isNull(entityFacts.objectId),
        isNull(entityFacts.supersededById),
      ),
    )
    .limit(1);

  const same = current && (current.value ?? null)?.toLowerCase() === value?.toLowerCase() && (current.validFrom ?? null) === validFrom;
  if (current && same) return { fact: current, superseded: null, duplicate: true };

  const [fact] = await db
    .insert(entityFacts)
    .values({ subjectId: input.subjectId, predicate: input.predicate, objectId, value, validFrom, storyId: input.storyId ?? null })
    .returning();
  if (current) {
    const closedAt = validFrom && input.predicate === "price" ? validFrom : new Date().toISOString().slice(0, 10);
    await db.update(entityFacts).set({ validTo: closedAt, supersededById: fact.id }).where(eq(entityFacts.id, current.id));
  }
  return { fact, superseded: current ?? null, duplicate: false };
}

export async function linkStories(storyId: string, relatedStoryId: string, kind: "follow_up" | "supersedes") {
  if (storyId === relatedStoryId) return;
  const [exists] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, relatedStoryId)).limit(1);
  if (!exists) return;
  await db.insert(storyLinks).values({ storyId, relatedStoryId, kind }).onConflictDoNothing();
}

export type GraphExtraction = {
  entities: { name: string; kind: EntityKind; vendor?: string | null }[];
  facts: {
    subject: string;
    predicate: FactPredicate;
    object?: string | null;
    value?: string | null;
    effective_date?: string | null;
  }[];
  followsUpStoryId?: string | null;
};

/** Write a story's extracted entities, facts and arcs into the graph. */
export async function recordStoryGraph(storyId: string, vendorSlugs: string[], extraction: GraphExtraction) {
  await linkStoryVendors(storyId, vendorSlugs);
  const byName = new Map<string, Entity>();
  for (const e of extraction.entities.slice(0, 12)) {
    const row = await upsertEntity({ name: e.name, kind: e.kind, vendorSlug: e.vendor ?? null });
    if (!row) continue;
    byName.set(normalizeName(e.name).toLowerCase(), row);
    // Products and models also hang off their maker.
    if (row.vendorSlug && row.kind !== "vendor") {
      const maker = await ensureVendorEntity(row.vendorSlug);
      if (maker) await linkStoryEntities(storyId, [maker.id]);
    }
  }
  await linkStoryEntities(storyId, [...byName.values()].map((e) => e.id));

  const resolve = async (name: string | null | undefined) => {
    if (!name) return null;
    return byName.get(normalizeName(name).toLowerCase()) ?? (await findEntityByName(name));
  };

  let facts = 0;
  for (const f of extraction.facts.slice(0, 12)) {
    const subject = await resolve(f.subject);
    if (!subject) continue;
    const object = await resolve(f.object);
    const validFrom = parseFactDate(f.effective_date);
    // Deadline facts are meaningless without a date; price facts need a value.
    if ((DEADLINE_PREDICATES as string[]).includes(f.predicate) && !validFrom) continue;
    if (f.predicate === "price" && !f.value) continue;
    if ((f.predicate === "adopted" || f.predicate === "supersedes") && !object) continue;
    const { superseded, duplicate } = await recordFact({
      subjectId: subject.id,
      predicate: f.predicate,
      objectId: object?.id ?? null,
      value: f.value ?? null,
      validFrom,
      storyId,
    });
    if (!duplicate) facts++;
    if (superseded?.storyId) await linkStories(storyId, superseded.storyId, "supersedes");
  }
  if (extraction.followsUpStoryId) await linkStories(storyId, extraction.followsUpStoryId, "follow_up");
  return { entities: byName.size, facts };
}
