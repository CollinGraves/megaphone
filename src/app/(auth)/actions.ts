"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { track } from "@/lib/tracking";

const MAX_AGE_MS = 10 * 60 * 1000;

/** Attach referral + acquisition source to a just-created account (first write wins). */
export async function recordSignupContext(input: { ref?: string | null; source?: string | null }) {
  const current = await getCurrentUser();
  if (!current || current.signupSource || Date.now() - current.createdAt.getTime() > MAX_AGE_MS) return;
  let referredById: string | null = null;
  if (input.ref && input.ref !== current.id) {
    const [referrer] = await db.select({ id: user.id }).from(user).where(eq(user.id, input.ref)).limit(1);
    referredById = referrer?.id ?? null;
  }
  const source = (input.source ?? "").replace(/[^\w:.\-]/g, "").slice(0, 80) || (referredById ? "colleague_invite" : "direct");
  await db.update(user).set({ signupSource: source, referredById }).where(eq(user.id, current.id));
  if (referredById) await track("signup", { userId: referredById, metadata: { referredUserId: current.id, kind: "referral" } });
}
