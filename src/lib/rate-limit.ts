import "server-only";
import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export type RateLimitResult = { allowed: boolean; count: number; limit: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in Postgres: one upsert per check, atomic under concurrency.
 * `key` should already identify the action and the caller, e.g. `contact:ip:<hash>`.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, windowStart: new Date() })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
  const elapsed = (Date.now() - row.windowStart.getTime()) / 1000;
  return {
    allowed: row.count <= limit,
    count: row.count,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  };
}

/** A stable, non-reversible identifier for the caller's IP (behind Vercel's proxy). */
export async function clientIpKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${process.env.BETTER_AUTH_SECRET ?? ""}:${ip}`).digest("hex").slice(0, 32);
}

/** Drop counters whose window ended long ago. */
export async function pruneRateLimits(olderThanHours = 24) {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - olderThanHours * 36e5)));
}
