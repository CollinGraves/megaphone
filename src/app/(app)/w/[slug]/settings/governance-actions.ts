"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { organizations, type GovernancePolicy } from "@/db/schema";
import { GATEABLE_STAGES, REVIEW_INTERVAL_OPTIONS, normalizePolicy } from "@/lib/governance";
import { STAGES, labelFrom } from "@/lib/taxonomy";
import { strs, type ActionState } from "@/lib/utils";
import { logActivity } from "@/lib/workspace";
import { authorize, revalidateWorkspace, runAction } from "../_lib/action-utils";

const policySchema = z.object({
  approvalRequiredStages: z.array(z.enum(GATEABLE_STAGES, { error: "pick pilot and/or production" })).max(2),
  reviewIntervalMonths: z.coerce
    .number({ error: "pick an interval" })
    .refine((n) => (REVIEW_INTERVAL_OPTIONS as readonly number[]).includes(n), "pick 6, 12 or 24 months"),
});

export async function updateGovernancePolicy(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const parsed = policySchema.parse({
      approvalRequiredStages: [...new Set(strs(form, "approvalRequiredStages"))],
      reviewIntervalMonths: form.get("reviewIntervalMonths"),
    });
    const before = normalizePolicy(ctx.org.governancePolicy);
    const policy: GovernancePolicy = {
      // Keep pipeline order regardless of the order the checkboxes were submitted in.
      approvalRequiredStages: GATEABLE_STAGES.filter((s) => parsed.approvalRequiredStages.includes(s)),
      reviewIntervalMonths: parsed.reviewIntervalMonths,
    };
    if (before.reviewIntervalMonths === policy.reviewIntervalMonths && before.approvalRequiredStages.join() === policy.approvalRequiredStages.join()) {
      return { ok: true, message: "No changes to save." };
    }
    await db.update(organizations).set({ governancePolicy: policy }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "governance.policy_updated", {
      approvalRequiredStages: policy.approvalRequiredStages,
      reviewIntervalMonths: policy.reviewIntervalMonths,
      previous: before,
    });
    revalidateWorkspace(ctx.org.slug);
    const gated = policy.approvalRequiredStages.map((s) => labelFrom(STAGES, s));
    return {
      ok: true,
      message: gated.length
        ? `Policy saved: approval required before ${gated.join(" and ")}; reviews every ${policy.reviewIntervalMonths} months.`
        : `Policy saved: no stage requires approval; reviews every ${policy.reviewIntervalMonths} months.`,
    };
  });
}
