"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { consultantAssignments, leadProfiles, platformRole, user } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import type { ActionState } from "@/lib/utils";

const roleSchema = z.object({ userId: z.string().min(1).max(64), role: z.enum(platformRole.enumValues) });

export async function setPlatformRole(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await requirePlatformAdmin();
  const parsed = roleSchema.safeParse({ userId: form.get("userId"), role: form.get("role") });
  if (!parsed.success) return { error: "Invalid role change." };
  const { userId, role } = parsed.data;
  if (userId === me.id) return { error: "You can't change your own role." };

  // Serialize role changes so two admins demoting each other can't leave zero admins.
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('platform_role_change'))`);
    const [target] = await tx.select({ role: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1);
    if (!target) return { error: "User not found." };
    if (target.role === role) return { ok: true };
    if (target.role === "admin") {
      const [{ admins }] = await tx.select({ admins: count() }).from(user).where(eq(user.platformRole, "admin"));
      if (admins <= 1) return { error: "There must always be at least one admin." };
    }
    await tx.update(user).set({ platformRole: role, updatedAt: new Date() }).where(and(eq(user.id, userId), eq(user.platformRole, target.role)));
    if (role === "user") {
      // No longer staff: drop workspace assignments and hand their leads back to the pool.
      await tx.delete(consultantAssignments).where(eq(consultantAssignments.userId, userId));
      await tx.update(leadProfiles).set({ ownerId: null }).where(eq(leadProfiles.ownerId, userId));
    }
    return { ok: true, message: "Role updated." };
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  return result;
}
