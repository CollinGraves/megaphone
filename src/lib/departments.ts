/**
 * Departments: pure rules (safe on the client). A department lead gets a few workspace capabilities, but
 * only for their own department's initiatives and ideas. Everything else follows the workspace role.
 */
import type { DepartmentRole } from "@/db/schema";
import { slugify } from "@/lib/ingest/heuristics";
import { can, type Capability, type WorkspaceAccess } from "@/lib/permissions";

export const DEPARTMENT_ROLES: { slug: DepartmentRole; label: string }[] = [
  { slug: "lead", label: "Lead" },
  { slug: "member", label: "Member" },
];

/** What a lead can do inside their department, on top of their workspace role. */
export const LEAD_CAPABILITIES = ["governance:approve", "ideas:triage", "departments:manage"] as const satisfies readonly Capability[];

/**
 * Can someone act on a thing that belongs to a department? Their workspace role decides first; a lead of
 * that department also gets the lead capabilities. Things with no department fall back to the workspace role.
 */
export function canInDepartment(access: WorkspaceAccess | null | undefined, capability: Capability, roleInDepartment: DepartmentRole | null | undefined): boolean {
  if (can(access, capability)) return true;
  if (!access || roleInDepartment !== "lead") return false;
  return (LEAD_CAPABILITIES as readonly Capability[]).includes(capability);
}

/** URL slug for a department name, unique within the workspace via a numeric suffix. */
export function departmentSlug(name: string, taken: ReadonlySet<string>): string {
  // slugify() has its own fallback for empty input; departments get theirs.
  const base = /[a-z0-9]/i.test(name) ? slugify(name, 40) || "department" : "department";
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}
