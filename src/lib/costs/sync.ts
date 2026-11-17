import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { costConnections, costLines, type CostConnection } from "@/db/schema";
import { decryptSecret } from "./secret";
import { fetchDailyCosts, ProviderError, type ApiProviderId, type Fetcher } from "./providers";

/** First sync pulls this much history; later syncs refresh the last week (vendors revise recent days). */
export const BACKFILL_DAYS = 90;
export const REFRESH_DAYS = 7;

const utcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Pull a connection's recent costs and replace that window in cost_lines. */
export async function syncConnection(conn: CostConnection, opts: { days?: number; now?: Date; fetcher?: Fetcher } = {}) {
  if (conn.provider === "microsoft") return { ok: false as const, error: "Microsoft 365 syncing isn't available yet." };
  const now = opts.now ?? new Date();
  const days = opts.days ?? (conn.lastSyncedAt ? REFRESH_DAYS : BACKFILL_DAYS);
  const start = utcMidnight(new Date(now.getTime() - days * 864e5));
  const end = utcMidnight(new Date(now.getTime() + 864e5)); // through today (exclusive tomorrow)
  try {
    if (!conn.secret) throw new ProviderError("This connection has no key. Disconnect and connect it again.");
    const rows = await fetchDailyCosts(conn.provider as ApiProviderId, decryptSecret(conn.secret), start, end, opts.fetcher);
    const startDay = start.toISOString().slice(0, 10);
    await db.transaction(async (tx) => {
      await tx.delete(costLines).where(and(eq(costLines.connectionId, conn.id), gte(costLines.day, startDay)));
      for (let i = 0; i < rows.length; i += 500) {
        await tx.insert(costLines).values(rows.slice(i, i + 500).map((r) => ({ ...r, orgId: conn.orgId, connectionId: conn.id })));
      }
      await tx
        .update(costConnections)
        .set({ status: "active", lastSyncedAt: now, lastError: null, updatedAt: now })
        .where(eq(costConnections.id, conn.id));
    });
    return { ok: true as const, rows: rows.length };
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : "Something went wrong while syncing. We'll try again tonight.";
    if (!(err instanceof ProviderError)) console.error(`[costs] sync ${conn.id} failed`, err);
    await db.update(costConnections).set({ status: "error", lastError: message, updatedAt: now }).where(eq(costConnections.id, conn.id));
    return { ok: false as const, error: message };
  }
}

/** Nightly: refresh every API-key connection. */
export async function syncAllConnections(now = new Date()) {
  const conns = await db.select().from(costConnections).where(inArray(costConnections.provider, ["openai", "anthropic"]));
  const tally = { connections: conns.length, ok: 0, failed: 0, rows: 0 };
  for (const c of conns) {
    const r = await syncConnection(c, { now });
    if (r.ok) {
      tally.ok++;
      tally.rows += r.rows;
    } else tally.failed++;
  }
  return tally;
}
