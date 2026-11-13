import "./load-env";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { classifyEmail, companyDomain, emailDomain } from "@/lib/email-domains";
import { ensureCompany, requestEnrichment } from "@/lib/enrichment";

/** Sets user.companyDomain for existing accounts and creates company rows. Safe to re-run. */
async function main() {
  const rows = await db.select({ id: user.id, email: user.email }).from(user).where(isNull(user.companyDomain));
  const domains = new Set<string>();
  for (const r of rows) {
    if (classifyEmail(r.email) !== "work") continue;
    const domain = companyDomain(emailDomain(r.email));
    await db.update(user).set({ companyDomain: domain }).where(eq(user.id, r.id));
    domains.add(domain);
  }
  for (const d of domains) {
    await ensureCompany(d);
    if (process.argv.includes("--enrich")) console.log(d, (await requestEnrichment(d)).status);
  }
  console.log(`[backfill] ${rows.length} users checked, ${domains.size} company domains`);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
