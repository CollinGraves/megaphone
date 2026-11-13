import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // `prepare: false` keeps us compatible with Supabase's transaction pooler (port 6543).
  return postgres(url, { prepare: false, max: process.env.NODE_ENV === "production" ? 5 : 10 });
}

const client = globalForDb.pg ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
