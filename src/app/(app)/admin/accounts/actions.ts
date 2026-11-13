"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { requestEnrichment } from "@/lib/enrichment";
import { COMPANY_SIZES } from "@/lib/taxonomy";
import type { ActionState } from "@/lib/utils";

const CompanySchema = z.object({
  domain: z.string().min(3).max(253),
  name: z.string().trim().min(1, "Name is required").max(200),
  industry: z.string().trim().max(200).optional(),
  sizeRange: z.enum(COMPANY_SIZES).optional(),
  website: z.string().trim().max(500).optional(),
  linkedinUrl: z.string().trim().max(500).optional(),
});

export async function updateCompany(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = CompanySchema.safeParse({
    domain: form.get("domain"),
    name: form.get("name"),
    industry: form.get("industry") || undefined,
    sizeRange: form.get("sizeRange") || undefined,
    website: form.get("website") || undefined,
    linkedinUrl: form.get("linkedinUrl") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { domain, ...rest } = parsed.data;
  const updated = await db
    .update(companies)
    .set({ ...rest, industry: rest.industry ?? null, sizeRange: rest.sizeRange ?? null, website: rest.website ?? null, linkedinUrl: rest.linkedinUrl ?? null })
    .where(eq(companies.domain, domain))
    .returning({ domain: companies.domain });
  if (!updated.length) return { error: "Account not found." };
  revalidatePath(`/admin/accounts/${domain}`);
  revalidatePath("/admin/accounts");
  return { ok: true, message: "Account saved." };
}

export async function requestCompanyEnrichment(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const domain = String(form.get("domain") ?? "");
  const result = await requestEnrichment(domain, { force: true });
  revalidatePath(`/admin/accounts/${domain}`);
  switch (result.status) {
    case "requested":
      return { ok: true, message: "Enrichment requested. Results will appear here when the provider responds." };
    case "not_configured":
      return { error: "No enrichment provider is configured. Set ENRICHMENT_WEBHOOK_URL (e.g. a Clay webhook) to enable it." };
    case "failed":
      return { error: `The enrichment provider returned an error: ${result.error}` };
    default:
      return { error: "Account not found." };
  }
}
