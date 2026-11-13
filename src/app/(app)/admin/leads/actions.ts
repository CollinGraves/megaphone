"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { contactRequests, leadProfiles, user } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { LEAD_STATUSES } from "@/lib/leads";
import type { ActionState } from "@/lib/utils";

const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES),
  ownerId: z.string().trim().max(64).transform((v) => v || null),
  notes: z
    .string()
    .max(10_000, "Notes are limited to 10,000 characters.")
    .transform((v) => v.trim() || null),
});

/** Admins and consultants both work the lead pipeline. */
export async function updateLead(userId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const parsed = leadUpdateSchema.safeParse({
    status: form.get("status"),
    ownerId: form.get("ownerId") ?? "",
    notes: form.get("notes") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const { status, ownerId, notes } = parsed.data;

  const [target] = await db.select({ role: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1);
  if (!target || target.role !== "user") return { error: "Lead not found." };
  if (ownerId) {
    const [owner] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, ownerId), inArray(user.platformRole, ["admin", "consultant"])))
      .limit(1);
    if (!owner) return { error: "Owner must be a North Labs staff member." };
  }

  await db
    .insert(leadProfiles)
    .values({ userId, status, ownerId, notes })
    .onConflictDoUpdate({ target: leadProfiles.userId, set: { status, ownerId, notes, updatedAt: new Date() } });

  revalidatePath(`/admin/leads/${userId}`);
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
  return { ok: true, message: "Lead updated." };
}

const handledSchema = z.object({ id: z.string().min(1).max(64), handled: z.enum(["1", "0"]) });

export async function setContactRequestHandled(form: FormData): Promise<void> {
  await requireStaff();
  const parsed = handledSchema.safeParse({ id: form.get("id"), handled: form.get("handled") });
  if (!parsed.success) throw new Error("Invalid request.");
  await db
    .update(contactRequests)
    .set({ handledAt: parsed.data.handled === "1" ? new Date() : null })
    .where(eq(contactRequests.id, parsed.data.id));
  revalidatePath("/admin/leads/requests");
  revalidatePath("/admin/leads", "layout");
  revalidatePath("/admin");
}
