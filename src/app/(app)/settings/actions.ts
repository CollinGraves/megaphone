"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { user, userPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { COMPANY_SIZES, INDUSTRY_SLUGS } from "@/lib/taxonomy";
import type { ActionState } from "@/lib/utils";

const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  company: z.string().trim().min(1, "Please enter your company").max(200),
  jobTitle: z.string().trim().min(1, "Please enter your job title").max(200),
  industry: z.enum(INDUSTRY_SLUGS as [string, ...string[]], { message: "Please choose an industry" }),
  companySize: z.enum(COMPANY_SIZES, { message: "Please choose a company size" }),
});

const DigestSchema = z.enum(["weekly", "off"]);

async function save(form: FormData) {
  const current = await getCurrentUser();
  if (!current) return { error: "Your session has expired. Please sign in again." } as const;
  const profile = ProfileSchema.safeParse({
    name: form.get("name"),
    company: form.get("company"),
    jobTitle: form.get("jobTitle"),
    industry: form.get("industry"),
    companySize: form.get("companySize"),
  });
  if (!profile.success) return { error: profile.error.issues[0]?.message ?? "Please check your details." } as const;
  const digest = DigestSchema.safeParse(form.get("digestFrequency") ?? "weekly");
  if (!digest.success) return { error: "Please choose whether to get the weekly email." } as const;

  await db.update(user).set({ ...profile.data, updatedAt: new Date() }).where(eq(user.id, current.id));
  await db
    .insert(userPreferences)
    .values({ userId: current.id, digestFrequency: digest.data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { digestFrequency: digest.data } });
  return { ok: true } as const;
}

export async function updateSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await save(form);
  if ("error" in result) return { error: result.error };
  revalidatePath("/settings");
  return { ok: true, message: "Settings saved." };
}
