import "./load-env";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sources } from "@/db/schema";
import { SEED_SOURCES } from "@/lib/ingest/seed-sources";

export async function seedSources() {
  const rows = SEED_SOURCES.map((s) => ({
    name: s.name,
    homepageUrl: s.homepageUrl,
    feedUrl: s.feedUrl,
    type: s.type ?? "rss",
    pathFilter: s.pathFilter ?? null,
    vendor: s.vendor ?? null,
    defaultCategory: s.defaultCategory ?? null,
    authority: s.authority,
    aiOnly: s.aiOnly ?? true,
    maxItemsPerFetch: s.maxItemsPerFetch ?? 25,
  }));
  await db
    .insert(sources)
    .values(rows)
    .onConflictDoUpdate({
      target: sources.feedUrl,
      set: {
        name: sql`excluded.name`,
        homepageUrl: sql`excluded.homepage_url`,
        vendor: sql`excluded.vendor`,
        authority: sql`excluded.authority`,
        aiOnly: sql`excluded.ai_only`,
      },
    });
  console.log(`[seed] upserted ${rows.length} sources`);
}

if (process.argv[1]?.endsWith("seed-sources.ts")) {
  seedSources().then(() => process.exit(0));
}
