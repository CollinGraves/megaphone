import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { VENDOR_SLUGS } from "@/lib/taxonomy";

const NEWS_VENDORS = new Set<string>(VENDOR_SLUGS);

/**
 * The AI vendors a workspace's active projects run on, most-used first, with the projects that use
 * each one. This is what "news that affects you" means for a workspace.
 */
export async function workspaceVendors(orgId: string): Promise<{ vendor: string; projects: string[] }[]> {
  const rows = await db
    .select({ title: initiatives.title, platforms: initiatives.platforms })
    .from(initiatives)
    .where(and(eq(initiatives.orgId, orgId), isNull(initiatives.archivedAt)));
  const byVendor = new Map<string, string[]>();
  // Only real AI vendors have news; platform values like "built in-house" are skipped.
  for (const r of rows) for (const v of r.platforms) if (NEWS_VENDORS.has(v)) byVendor.set(v, [...(byVendor.get(v) ?? []), r.title]);
  return [...byVendor].map(([vendor, projects]) => ({ vendor, projects })).sort((a, b) => b.projects.length - a.projects.length || a.vendor.localeCompare(b.vendor));
}

/** "Used by Invoice triage and 2 more" style label for a story card. */
export function usedByLabel(projects: string[]): string {
  if (projects.length === 0) return "";
  return projects.length === 1 ? `Used by ${projects[0]}` : `Used by ${projects[0]} and ${projects.length - 1} more`;
}
