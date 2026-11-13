import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { dataDependencies, initiatives, systems } from "@/db/schema";

/** All dependencies on active (non-archived) initiatives in the org, with system + initiative names. */
export async function loadOrgDependencies(orgId: string) {
  return db
    .select({
      id: dataDependencies.id,
      accessStatus: dataDependencies.accessStatus,
      sensitivity: dataDependencies.sensitivity,
      dataDescription: dataDependencies.dataDescription,
      notes: dataDependencies.notes,
      systemId: systems.id,
      systemName: systems.name,
      systemCategory: systems.category,
      initiativeId: initiatives.id,
      initiativeTitle: initiatives.title,
      initiativeStage: initiatives.stage,
    })
    .from(dataDependencies)
    .innerJoin(initiatives, eq(dataDependencies.initiativeId, initiatives.id))
    .innerJoin(systems, eq(dataDependencies.systemId, systems.id))
    .where(and(eq(initiatives.orgId, orgId), eq(systems.orgId, orgId), isNull(initiatives.archivedAt)));
}

export type OrgDependency = Awaited<ReturnType<typeof loadOrgDependencies>>[number];

export type SystemUsage = {
  systemId: string;
  systemName: string;
  systemCategory: string;
  initiativeCount: number;
  blocked: number;
  requested: number;
  sensitive: number;
};

const SENSITIVE = new Set(["pii", "phi", "pci"]);

export function systemUsage(deps: OrgDependency[]): Map<string, SystemUsage> {
  const out = new Map<string, SystemUsage>();
  const seen = new Map<string, Set<string>>();
  for (const d of deps) {
    let u = out.get(d.systemId);
    if (!u) {
      u = { systemId: d.systemId, systemName: d.systemName, systemCategory: d.systemCategory, initiativeCount: 0, blocked: 0, requested: 0, sensitive: 0 };
      out.set(d.systemId, u);
      seen.set(d.systemId, new Set());
    }
    const ids = seen.get(d.systemId)!;
    ids.add(d.initiativeId);
    u.initiativeCount = ids.size;
    if (d.accessStatus === "blocked") u.blocked++;
    if (d.accessStatus === "requested") u.requested++;
    if (SENSITIVE.has(d.sensitivity)) u.sensitive++;
  }
  return out;
}
