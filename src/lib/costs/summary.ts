import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { costConnections, costLines, costMappings } from "@/db/schema";

export type CostDimension = {
  connectionId: string;
  provider: string;
  dimensionKey: string;
  name: string;
  last30: number;
  total90: number;
  initiativeId: string | null;
  ignored: boolean;
  mapped: boolean;
};

/** Everything the AI spend page needs, for one workspace. Amounts are USD. */
export async function loadCostSummary(orgId: string, now = new Date()) {
  const d30 = new Date(now.getTime() - 29 * 864e5).toISOString().slice(0, 10); // today + 29 earlier days
  const d90 = new Date(now.getTime() - 90 * 864e5).toISOString().slice(0, 10);
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1)).toISOString().slice(0, 10);

  const [connections, dims, months] = await Promise.all([
    db
      .select({
        id: costConnections.id,
        provider: costConnections.provider,
        status: costConnections.status,
        label: costConnections.label,
        secretHint: costConnections.secretHint,
        lastSyncedAt: costConnections.lastSyncedAt,
        lastError: costConnections.lastError,
      })
      .from(costConnections)
      .where(eq(costConnections.orgId, orgId)),
    db
      .select({
        connectionId: costLines.connectionId,
        provider: costConnections.provider,
        dimensionKey: costLines.dimensionKey,
        name: sql<string>`max(${costLines.dimensionName})`,
        last30: sql<number>`coalesce(sum(${costLines.amountUsd}) filter (where ${costLines.day} >= ${d30}), 0)`.mapWith(Number),
        total90: sql<number>`sum(${costLines.amountUsd})`.mapWith(Number),
        initiativeId: sql<string | null>`max(${costMappings.initiativeId})`,
        ignored: sql<boolean>`coalesce(bool_or(${costMappings.ignored}), false)`,
        mapped: sql<boolean>`count(${costMappings.id}) > 0`,
      })
      .from(costLines)
      .innerJoin(costConnections, eq(costConnections.id, costLines.connectionId))
      .leftJoin(costMappings, and(eq(costMappings.connectionId, costLines.connectionId), eq(costMappings.dimensionKey, costLines.dimensionKey)))
      .where(and(eq(costLines.orgId, orgId), gte(costLines.day, d90)))
      .groupBy(costLines.connectionId, costConnections.provider, costLines.dimensionKey),
    db
      .select({
        month: sql<string>`to_char(${costLines.day}, 'YYYY-MM')`,
        provider: costConnections.provider,
        amount: sql<number>`sum(${costLines.amountUsd})`.mapWith(Number),
      })
      .from(costLines)
      .innerJoin(costConnections, eq(costConnections.id, costLines.connectionId))
      .where(and(eq(costLines.orgId, orgId), gte(costLines.day, firstOfMonth)))
      .groupBy(sql`1`, costConnections.provider),
  ]);

  const dimensions: CostDimension[] = dims
    .map((d) => ({ ...d, name: d.name ?? d.dimensionKey, mapped: Boolean(d.mapped), ignored: Boolean(d.ignored) }))
    .sort((a, b) => b.last30 - a.last30);

  const byProject = new Map<string, number>();
  for (const d of dimensions) if (d.initiativeId && !d.ignored) byProject.set(d.initiativeId, (byProject.get(d.initiativeId) ?? 0) + d.last30);

  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const monthTotal = (m: string) => months.filter((x) => x.month === m).reduce((n, x) => n + x.amount, 0);

  return {
    connections,
    dimensions,
    months,
    byProject,
    totals: {
      last30: dimensions.reduce((n, d) => n + d.last30, 0),
      thisMonth: monthTotal(thisMonth),
      lastMonth: monthTotal(lastMonth),
      unassigned30: dimensions.filter((d) => !d.initiativeId && !d.ignored).reduce((n, d) => n + d.last30, 0),
    },
  };
}
