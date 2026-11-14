"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { loadActivation } from "@/lib/onboarding";
import type { ActionState } from "@/lib/utils";
import { logActivity } from "@/lib/workspace";
import { authorize, revalidateWorkspace, runAction } from "./action-utils";

/** Hide the setup checklist (and the Guided Launch offer) for everyone in the workspace. Admins only. */
export async function dismissOnboarding(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const [updated] = await db
      .update(organizations)
      .set({ onboardingDismissedAt: new Date() })
      .where(and(eq(organizations.id, ctx.org.id), isNull(organizations.onboardingDismissedAt)))
      .returning({ id: organizations.id });
    if (updated) {
      const { percent, complete } = await loadActivation(ctx.org.id);
      await logActivity(ctx, "onboarding.dismissed", { percent, complete });
    }
    revalidateWorkspace(ctx.org.slug);
  });
}
