"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { initiativeAlerts, stories } from "@/db/schema";
import type { ActionState } from "@/lib/utils";
import { logActivity } from "@/lib/workspace";
import { authorize, revalidateWorkspace, runAction, zId } from "../_lib/action-utils";
import { getOwnedAlert } from "../_lib/guards";

export async function dismissAlert(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const alert = await getOwnedAlert(ctx, zId().parse(form.get("id")));
    if (alert.dismissedAt) return { ok: true };
    await db.update(initiativeAlerts).set({ dismissedAt: new Date() }).where(eq(initiativeAlerts.id, alert.id));
    const [story] = await db.select({ title: stories.title }).from(stories).where(eq(stories.id, alert.storyId)).limit(1);
    await logActivity(ctx, "alert.dismissed", { story: story?.title }, alert.initiativeId);
    revalidateWorkspace(ctx.org.slug);
  });
}
