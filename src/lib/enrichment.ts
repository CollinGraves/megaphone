import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, companyContacts, user } from "@/db/schema";
import { companyDomain, guessCompanyName } from "./email-domains";
import { appUrl } from "./env";
import { COMPANY_SIZES } from "./taxonomy";

/**
 * Company enrichment is provider-agnostic:
 *  - Outbound: when a new business domain signs up, we POST it to ENRICHMENT_WEBHOOK_URL
 *    (e.g. a Clay table's webhook source). The payload includes a callback URL.
 *  - Inbound: the provider POSTs results to /api/integrations/enrichment with
 *    `Authorization: Bearer ENRICHMENT_API_SECRET`.
 */

export function sizeRangeFor(employees: number | null | undefined): string | null {
  if (employees == null || !Number.isFinite(employees) || employees <= 0) return null;
  if (employees <= 50) return COMPANY_SIZES[0];
  if (employees <= 200) return COMPANY_SIZES[1];
  if (employees <= 1000) return COMPANY_SIZES[2];
  if (employees <= 5000) return COMPANY_SIZES[3];
  return COMPANY_SIZES[4];
}

/** Create the company row for a business domain if it doesn't exist. Returns the row. */
export async function ensureCompany(rawDomain: string) {
  const domain = companyDomain(rawDomain);
  const [row] = await db
    .insert(companies)
    .values({ domain, name: guessCompanyName(domain) })
    .onConflictDoUpdate({ target: companies.domain, set: { updatedAt: sql`${companies.updatedAt}` } })
    .returning();
  return row;
}

export async function requestEnrichment(domain: string, opts: { force?: boolean } = {}) {
  const url = process.env.ENRICHMENT_WEBHOOK_URL;
  const [company] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
  if (!company) return { status: "missing" as const };
  if (!url) return { status: "not_configured" as const };
  if (!opts.force && company.enrichmentStatus !== "pending" && company.enrichmentStatus !== "failed") {
    return { status: "skipped" as const };
  }
  const people = await db
    .select({ name: user.name, email: user.email, jobTitle: user.jobTitle })
    .from(user)
    .where(eq(user.companyDomain, domain))
    .limit(25);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.ENRICHMENT_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.ENRICHMENT_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        domain,
        company_name_guess: company.name,
        website: `https://${domain}`,
        known_people: people,
        callback_url: `${appUrl()}/api/integrations/enrichment`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await db.update(companies).set({ enrichmentStatus: "requested", enrichmentRequestedAt: new Date() }).where(eq(companies.domain, domain));
    return { status: "requested" as const };
  } catch (err) {
    await db.update(companies).set({ enrichmentStatus: "failed" }).where(eq(companies.domain, domain));
    return { status: "failed" as const, error: err instanceof Error ? err.message : String(err) };
  }
}

const optionalString = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v ? v : null));

export const EnrichmentPayload = z.object({
  domain: z.string().trim().toLowerCase().min(3).max(253),
  name: optionalString,
  website: optionalString,
  industry: optionalString,
  employee_count: z.coerce.number().int().positive().nullish(),
  headquarters: optionalString,
  linkedin_url: optionalString,
  description: optionalString,
  source: optionalString,
  /** Technographics: tools/platforms the company uses, e.g. ["Salesforce", "Snowflake"]. */
  technologies: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        title: optionalString,
        email: z.email().nullish(),
        linkedin_url: optionalString,
      }),
    )
    .max(200)
    .optional(),
});

export async function applyEnrichment(input: z.infer<typeof EnrichmentPayload>, raw: unknown) {
  const domain = companyDomain(input.domain);
  await ensureCompany(domain);
  const updates: Partial<typeof companies.$inferInsert> = {
    enrichmentStatus: "enriched",
    enrichedAt: new Date(),
    enrichmentSource: input.source ?? "webhook",
    raw: raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null,
  };
  if (input.name) updates.name = input.name;
  if (input.website) updates.website = input.website;
  if (input.industry) updates.industry = input.industry;
  if (input.employee_count) {
    updates.employeeCount = input.employee_count;
    updates.sizeRange = sizeRangeFor(input.employee_count);
  }
  if (input.headquarters) updates.headquarters = input.headquarters;
  if (input.linkedin_url) updates.linkedinUrl = input.linkedin_url;
  if (input.description) updates.description = input.description;
  await db.update(companies).set(updates).where(eq(companies.domain, domain));

  let contacts = 0;
  for (const c of input.contacts ?? []) {
    // Only keep contacts that actually belong to this company's domain (or have no email).
    if (c.email && companyDomain(c.email.split("@")[1] ?? "") !== domain) continue;
    await db
      .insert(companyContacts)
      .values({
        domain,
        fullName: c.name,
        title: c.title ?? null,
        email: c.email?.toLowerCase() ?? null,
        linkedinUrl: c.linkedin_url ?? null,
        source: input.source ?? "webhook",
      })
      .onConflictDoUpdate({
        target: [companyContacts.domain, companyContacts.fullName],
        set: { title: c.title ?? null, email: c.email?.toLowerCase() ?? null, linkedinUrl: c.linkedin_url ?? null },
      });
    contacts++;
  }
  if (input.technologies?.length) {
    const { addEnrichedTechnologies } = await import("./graph/stack");
    await addEnrichedTechnologies(domain, input.technologies);
  }
  // Backfill company size on users who haven't set one yet.
  if (updates.sizeRange) {
    await db
      .update(user)
      .set({ companySize: updates.sizeRange })
      .where(sql`${user.companyDomain} = ${domain} and ${user.companySize} is null`);
  }
  return { domain, contacts };
}
