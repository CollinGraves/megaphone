import "./load-env";
import { db } from "@/db";
import { stories } from "@/db/schema";
import { linkStoryVendors } from "@/lib/graph/entities";
import { refreshAllCompanyStacks } from "@/lib/graph/stack";

/** Link existing stories to vendor entities and compute company stacks. Safe to re-run. */
async function main() {
  const rows = await db.select({ id: stories.id, vendors: stories.vendors }).from(stories);
  for (const r of rows) await linkStoryVendors(r.id, r.vendors);
  const stacks = await refreshAllCompanyStacks();
  console.log(`[graph] linked ${rows.length} stories, refreshed ${stacks} company stacks`);
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
