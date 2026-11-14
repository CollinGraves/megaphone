/**
 * Plan entitlements that need more than `hasFeature`. Pure module (client-safe).
 */
import type { GovernancePolicy } from "@/db/schema";
import { normalizePolicy } from "@/lib/governance";
import { hasFeature, type DbPlan } from "@/lib/plans";

/**
 * The governance policy that is actually enforced. Without `governance_workflow` the approval gate
 * is off (no stage requires approval) but the saved policy is kept, so it comes back on upgrade.
 */
export function enforcedGovernancePolicy(org: { plan: DbPlan | string; governancePolicy: Partial<GovernancePolicy> | null | undefined }): GovernancePolicy {
  const policy = normalizePolicy(org.governancePolicy);
  return hasFeature(org.plan, "governance_workflow") ? policy : { ...policy, approvalRequiredStages: [] };
}

/** Initiatives used vs. the plan limit, for usage meters. */
export function initiativeUsage(limit: number | null, used: number) {
  if (limit == null) return { used, limit: null, remaining: null, ratio: 0, atLimit: false, overLimit: false };
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    ratio: limit === 0 ? 1 : Math.min(1, used / limit),
    atLimit: used >= limit,
    overLimit: used > limit,
  };
}
