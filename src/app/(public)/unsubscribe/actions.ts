"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { verifyUserToken } from "@/lib/tracking";
import type { ActionState } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export async function unsubscribe(_prev: ActionState, form: FormData): Promise<ActionState> {
  const userId = verifyUserToken(String(form.get("u") ?? ""));
  if (!userId) return { error: "This unsubscribe link is invalid." };
  await db.update(userPreferences).set({ digestFrequency: "off" }).where(eq(userPreferences.userId, userId));
  return { ok: true, message: `You've been unsubscribed from the ${BRAND} digest. Your feed is still available any time.` };
}
