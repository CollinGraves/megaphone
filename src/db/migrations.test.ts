import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Supabase exposes the public schema over its Data API, so every app table must have row-level security
 * on (the app connects as the table owner, which bypasses it). The bootstrap SQL enabled it for tables
 * that existed then (migrations up to 0012, plus 0013 by hand); since 0014 each migration must enable it
 * for the tables it creates.
 */
const DIR = join(process.cwd(), "drizzle");
const FIRST_CHECKED = 14;

describe("migrations", () => {
  const files = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= FIRST_CHECKED);

  it.each(files)("%s enables row-level security on every table it creates", (file) => {
    const sql = readFileSync(join(DIR, file), "utf8");
    const created = [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]);
    const secured = new Set([...sql.matchAll(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1]));
    expect(created.filter((t) => !secured.has(t))).toEqual([]);
  });
});
