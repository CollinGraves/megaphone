import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { clientOptions } from "./options";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // Pooler-safe settings (no prepared statements, no pipelining behind Supavisor): see ./options.ts.
  return postgres(url, clientOptions(url));
}

const client = globalForDb.pg ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
