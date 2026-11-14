import type { Options, PostgresType } from "postgres";

/** True when the URL points at a transaction-mode pooler (Supabase/Supavisor on 6543, or any pooler.supabase.com host). */
export function isTransactionPooler(url: string): boolean {
  try {
    const u = new URL(url);
    return u.port === "6543" || u.hostname.endsWith(".pooler.supabase.com");
  } catch {
    return false;
  }
}

/**
 * postgres.js options for our deployment targets.
 *
 * - `prepare: false`: transaction poolers can't keep named prepared statements between transactions.
 * - `max_pipeline: 1` behind a transaction pooler: Supavisor (Supabase port 6543) hangs on pipelined
 *   queries in transaction mode: they are sent but never answered, so any page that runs more queries
 *   in parallel than the pool has connections stalls until the function times out. One query per
 *   connection at a time avoids it; direct connections keep the default pipelining.
 * - `query_timeout` in production: if the pooler or network goes silent, fail the query (and reconnect)
 *   instead of hanging the request for the platform's full function timeout.
 */
export function clientOptions(url: string, env: { NODE_ENV?: string } = process.env): Options<Record<string, PostgresType>> {
  const production = env.NODE_ENV === "production";
  return {
    prepare: false,
    max: production ? 5 : 10,
    ...(isTransactionPooler(url) ? { max_pipeline: 1 } : {}),
    ...(production ? { query_timeout: 30 } : {}),
  };
}
