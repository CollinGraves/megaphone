import "server-only";
import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyStack, entities, initiatives, memberships, systems, user, userPreferences, type Entity } from "@/db/schema";
import { ensureVendorEntity, findEntityByName, upsertEntity } from "./entities";

/**
 * A company's AI/tech stack, inferred from several signals and confirmed by its people.
 *  - enrichment: technographics returned by the enrichment provider
 *  - workspace:  platforms and systems in the company's AI Radar Workspace
 *  - colleagues: vendors that at least two people at the company follow (aggregate only, never attributed)
 *  - user:       added or confirmed by someone at the company
 */
export type StackSource = "enrichment" | "workspace" | "colleagues" | "user";

/** How sure we are that the company uses a vendor, given how many colleagues independently follow it. */
export function colleagueConfidence(followers: number): number {
  if (followers < 2) return 0;
  return Math.min(0.8, 0.4 + 0.1 * (followers - 2));
}

type Candidate = { entityId: string; source: StackSource; confidence: number };

async function upsertInferred(domain: string, items: Candidate[]) {
  // Highest-confidence signal wins per entity.
  const best = new Map<string, Candidate>();
  for (const c of items) if (!best.has(c.entityId) || best.get(c.entityId)!.confidence < c.confidence) best.set(c.entityId, c);
  for (const c of best.values()) {
    await db
      .insert(companyStack)
      .values({ domain, entityId: c.entityId, source: c.source, confidence: c.confidence })
      .onConflictDoUpdate({
        target: [companyStack.domain, companyStack.entityId],
        // Never override a human decision; only refresh inferred rows (and revive ones that lapsed).
        set: { source: c.source, confidence: c.confidence, validTo: null },
        setWhere: sql`${companyStack.status} = 'inferred'`,
      });
  }
  return best;
}

/** Recompute the inferred parts of a company's stack. Confirmed/rejected rows are left alone. */
export async function refreshCompanyStack(domain: string) {
  const [company] = await db.select({ domain: companies.domain }).from(companies).where(eq(companies.domain, domain)).limit(1);
  if (!company) return 0;
  const candidates: Candidate[] = [];

  // Workspace signals: orgs that people at this domain belong to.
  const orgIds = (
    await db
      .selectDistinct({ orgId: memberships.orgId })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(eq(user.companyDomain, domain))
  ).map((r) => r.orgId);
  if (orgIds.length) {
    const [platformRows, systemRows] = await Promise.all([
      db
        .select({ platforms: initiatives.platforms })
        .from(initiatives)
        .where(and(inArray(initiatives.orgId, orgIds), isNull(initiatives.archivedAt))),
      db.select({ name: systems.name, vendor: systems.vendor }).from(systems).where(inArray(systems.orgId, orgIds)),
    ]);
    for (const slug of new Set(platformRows.flatMap((r) => r.platforms))) {
      const e = await ensureVendorEntity(slug);
      if (e) candidates.push({ entityId: e.id, source: "workspace", confidence: 0.9 });
    }
    for (const s of systemRows) {
      const e = (await findEntityByName(s.name)) ?? (await upsertEntity({ name: s.name, kind: "product" }));
      if (e) candidates.push({ entityId: e.id, source: "workspace", confidence: 0.9 });
    }
  }

  // Colleague signals: vendors followed by 2+ people at the company.
  const followed = await db.execute<{ vendor: string; n: number }>(sql`
    select v as vendor, count(distinct ${userPreferences.userId})::int as n
    from ${userPreferences}
    join ${user} on ${user.id} = ${userPreferences.userId}
    cross join lateral unnest(${userPreferences.vendors}) v
    where ${user.companyDomain} = ${domain}
    group by v`);
  for (const row of followed) {
    const confidence = colleagueConfidence(row.n);
    if (!confidence) continue;
    const e = await ensureVendorEntity(row.vendor);
    if (e) candidates.push({ entityId: e.id, source: "colleagues", confidence });
  }

  const kept = await upsertInferred(domain, candidates);

  // Inferred workspace/colleague rows whose signal disappeared lapse (kept for history via validTo).
  await db
    .update(companyStack)
    .set({ validTo: new Date() })
    .where(
      and(
        eq(companyStack.domain, domain),
        eq(companyStack.status, "inferred"),
        inArray(companyStack.source, ["workspace", "colleagues"]),
        isNull(companyStack.validTo),
        kept.size ? notInArray(companyStack.entityId, [...kept.keys()]) : undefined,
      ),
    );
  return kept.size;
}

export async function refreshAllCompanyStacks() {
  const domains = await db.selectDistinct({ domain: user.companyDomain }).from(user).where(isNotNull(user.companyDomain));
  let n = 0;
  for (const { domain } of domains) {
    if (!domain) continue;
    await refreshCompanyStack(domain);
    n++;
  }
  return n;
}

/** Technologies from the enrichment provider, e.g. ["Salesforce", "Snowflake", "Microsoft 365"]. */
export async function addEnrichedTechnologies(domain: string, names: string[]) {
  const items: Candidate[] = [];
  for (const name of names.slice(0, 100)) {
    const e = (await findEntityByName(name)) ?? (await upsertEntity({ name, kind: "product" }));
    if (e) items.push({ entityId: e.id, source: "enrichment", confidence: 0.7 });
  }
  await upsertInferred(domain, items);
  return items.length;
}

export type StackItem = {
  entity: Entity;
  source: StackSource;
  confidence: number;
  status: "inferred" | "confirmed" | "rejected";
};

/** Active stack items (not lapsed). Includes rejected ones only when asked. */
export async function getCompanyStack(domain: string, opts: { includeRejected?: boolean } = {}): Promise<StackItem[]> {
  const rows = await db
    .select({ entity: entities, source: companyStack.source, confidence: companyStack.confidence, status: companyStack.status })
    .from(companyStack)
    .innerJoin(entities, eq(entities.id, companyStack.entityId))
    .where(
      and(
        eq(companyStack.domain, domain),
        isNull(companyStack.validTo),
        opts.includeRejected ? undefined : sql`${companyStack.status} <> 'rejected'`,
      ),
    );
  return rows
    .map((r) => ({ ...r, source: r.source as StackSource }))
    .sort((a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed") || b.confidence - a.confidence || a.entity.name.localeCompare(b.entity.name));
}

export async function setStackItemStatus(domain: string, entityId: string, status: "confirmed" | "rejected", reviewerId: string) {
  await db
    .update(companyStack)
    .set({ status, reviewedById: reviewerId, confidence: status === "confirmed" ? 1 : 0 })
    .where(and(eq(companyStack.domain, domain), eq(companyStack.entityId, entityId)));
}

export async function addStackItem(domain: string, name: string, reviewerId: string): Promise<Entity | null> {
  const e = (await findEntityByName(name)) ?? (await upsertEntity({ name, kind: "product" }));
  if (!e) return null;
  await db
    .insert(companyStack)
    .values({ domain, entityId: e.id, source: "user", confidence: 1, status: "confirmed", reviewedById: reviewerId })
    .onConflictDoUpdate({
      target: [companyStack.domain, companyStack.entityId],
      set: { status: "confirmed", confidence: 1, reviewedById: reviewerId, validTo: null },
    });
  return e;
}
