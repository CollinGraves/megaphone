"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { acceptInvitation, findInvitation } from "@/lib/invitations";
import type { ActionState } from "@/lib/utils";

export async function acceptInvite(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = z.string().trim().min(10).max(200).safeParse(form.get("token"));
  if (!token.success) return { error: "This invitation link is invalid." };
  const current = await getCurrentUser();
  if (!current) return { error: "Please sign in to accept this invitation." };

  const found = await findInvitation(token.data);
  const result = await acceptInvitation(token.data, current);
  if (!result.ok) return { error: result.error };
  if (found) {
    await db.insert(activityLog).values({
      orgId: found.org.id,
      userId: current.id,
      action: "member.added",
      detail: { email: current.email, role: found.invitation.role, via: "invitation" },
    });
  }
  redirect(`/w/${result.slug}`);
}
