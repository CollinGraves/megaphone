import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SEED_SOURCES } from "@/lib/ingest/seed-sources";

/**
 * Generates one SQL file that bootstraps a fresh Postgres (e.g. a new Supabase project):
 *  1. creates a dedicated login role (`radar_app`) that owns all app objects,
 *  2. applies every Drizzle migration and records it in drizzle.__drizzle_migrations
 *     (so later `npm run db:migrate` runs only new migrations),
 *  3. enables row-level security on every app table (Supabase exposes `public` over its Data API;
 *     the app connects as the owner, which bypasses RLS) and revokes anon/authenticated access,
 *  4. seeds the source registry.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/export-bootstrap-sql.ts <out.sql> [role-password]
 * Run the output as the database's admin user (Supabase: SQL editor or the MCP `apply_migration` tool).
 * The output contains the role password — keep it out of the repo.
 */

const ROLE = "radar_app";
const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

const lit = (v: string | number | boolean | null | undefined) =>
  v === null || v === undefined ? "NULL" : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);

function main() {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: export-bootstrap-sql.ts <out.sql> [role-password]");
  const password = process.argv[3] ?? randomBytes(24).toString("base64url");

  const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as {
    entries: { tag: string; when: number }[];
  };

  const parts: string[] = [];
  parts.push(`-- AI Radar bootstrap · generated ${new Date().toISOString()} · ${journal.entries.length} migrations`);
  parts.push(`DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${ROLE}') THEN
    CREATE ROLE ${ROLE} LOGIN PASSWORD ${lit(password)};
  ELSE
    ALTER ROLE ${ROLE} LOGIN PASSWORD ${lit(password)};
  END IF;
END $$;`);
  // Let the admin act as the app role so everything below is owned by it.
  parts.push(`GRANT ${ROLE} TO CURRENT_USER WITH SET TRUE;`);
  parts.push(`GRANT USAGE, CREATE ON SCHEMA public TO ${ROLE};`);
  parts.push(`CREATE SCHEMA IF NOT EXISTS drizzle AUTHORIZATION ${ROLE};`);
  parts.push(`SET ROLE ${ROLE};`);
  parts.push(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);`);

  for (const entry of journal.entries) {
    const sql = readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    parts.push(`-- migration ${entry.tag}`);
    parts.push(sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean).join("\n"));
    parts.push(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${lit(hash)}, ${entry.when});`);
  }

  parts.push(`-- row-level security on every app table (owner role bypasses it)
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = '${ROLE}' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;`);

  const rows = SEED_SOURCES.map(
    (s) =>
      `(gen_random_uuid()::text, ${[
        lit(s.name),
        lit(s.homepageUrl),
        lit(s.feedUrl),
        lit(s.type ?? "rss"),
        lit(s.pathFilter ?? null),
        lit(s.vendor ?? null),
        lit(s.defaultCategory ?? null),
        lit(s.authority),
        lit(s.aiOnly ?? true),
        lit(s.maxItemsPerFetch ?? 25),
      ].join(", ")})`,
  );
  parts.push(`-- seed sources
INSERT INTO public.sources (id, name, homepage_url, feed_url, type, path_filter, vendor, default_category, authority, ai_only, max_items_per_fetch) VALUES
${rows.join(",\n")}
ON CONFLICT (feed_url) DO NOTHING;`);

  parts.push(`RESET ROLE;`);
  // Supabase's API roles: no direct access to app tables (no-ops on plain Postgres).
  parts.push(`DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;`);

  writeFileSync(out, parts.join("\n\n") + "\n");
  console.log(`Wrote ${out}`);
  console.log(`Role: ${ROLE}`);
  console.log(`Supabase pooled DATABASE_URL: postgres://${ROLE}.<project-ref>:${password}@<pooler-host>:6543/postgres`);
}

main();
