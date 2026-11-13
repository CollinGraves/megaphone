import "server-only";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { initiatives, systems } from "@/db/schema";

export async function listBusinessUnits(orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ bu: initiatives.businessUnit })
    .from(initiatives)
    .where(and(eq(initiatives.orgId, orgId), isNotNull(initiatives.businessUnit)))
    .orderBy(asc(initiatives.businessUnit));
  return rows.map((r) => r.bu!).filter(Boolean);
}

export async function listSystems(orgId: string) {
  return db.select().from(systems).where(eq(systems.orgId, orgId)).orderBy(asc(systems.name));
}
