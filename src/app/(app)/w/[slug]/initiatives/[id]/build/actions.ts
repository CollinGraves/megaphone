"use server";

import { z } from "zod";
import { briefQuota, recordBuildUpdate, startBriefGeneration } from "@/lib/build/server";
import { PLANS, planFor } from "@/lib/plans";
import type { ActionState } from "@/lib/utils";
import { getOwnedInitiative } from "../../../_lib/guards";
import { ActionError, authorize, revalidateWorkspace, runAction, zId } from "../../../_lib/action-utils";

export async function generateBrief(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const initiative = await getOwnedInitiative(ctx, zId().parse(form.get("initiativeId")));
    const guidance = z.string().trim().max(1000).optional().parse(form.get("guidance") || undefined) ?? null;
    const quota = await briefQuota(ctx.org);
    if (quota.remaining === 0) {
      const plan = planFor(ctx.org.plan);
      const next = plan.id === "free" ? PLANS.team : PLANS.business;
      throw new ActionError(
        `You've used all ${quota.limit} AI build briefs included in the ${plan.name} plan this month. Upgrade to ${next.name} for more, or try again later.`,
      );
    }
    await startBriefGeneration({ org: ctx.org, initiative, userId: ctx.user.id, guidance });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Generating your build brief. This usually takes under a minute." };
  });
}

const UpdateSchema = z.object({
  status: z.enum(["planned", "in_progress", "blocked", "done"]),
  message: z.string().trim().min(3, "Add a short update.").max(2000),
  link: z.union([z.literal(""), z.url().max(500)]).optional(),
});

export async function addBuildUpdate(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const initiative = await getOwnedInitiative(ctx, zId().parse(form.get("initiativeId")));
    const v = UpdateSchema.parse({ status: form.get("status"), message: form.get("message"), link: form.get("link") ?? "" });
    await recordBuildUpdate({
      orgId: ctx.org.id,
      initiativeId: initiative.id,
      userId: ctx.user.id,
      status: v.status,
      message: v.message,
      link: v.link || null,
      source: "app",
    });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Update posted." };
  });
}
