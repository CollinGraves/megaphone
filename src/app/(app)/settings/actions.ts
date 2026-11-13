"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { user, userPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { CATEGORY_SLUGS, COMPANY_SIZES, INDUSTRY_SLUGS, VENDOR_SLUGS } from "@/lib/taxonomy";
import { track } from "@/lib/tracking";
import { strs, type ActionState } from "@/lib/utils";

const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  company: z.string().trim().min(1, "Please enter your company").max(200),
  jobTitle: z.string().trim().min(1, "Please enter your job title").max(200),
  industry: z.enum(INDUSTRY_SLUGS as [string, ...string[]], { message: "Please choose an industry" }),
  companySize: z.enum(COMPANY_SIZES, { message: "Please choose a company size" }),
});

const PrefsSchema = z.object({
  categories: z.array(z.enum(CATEGORY_SLUGS as [string, ...string[]])),
  vendors: z.array(z.enum(VENDOR_SLUGS as [string, ...string[]])),
  industries: z.array(z.enum(INDUSTRY_SLUGS as [string, ...string[]])),
  minImportance: z.coerce.number().int().min(1).max(5),
  digestFrequency: z.enum(["daily", "weekly", "off"]),
});

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
  const prefs = PrefsSchema.safeParse({
    categories: strs(form, "categories"),
    vendors: strs(form, "vendors"),
    industries: strs(form, "industries"),
    minImportance: form.get("minImportance") ?? 2,
    digestFrequency: form.get("digestFrequency") ?? "weekly",
  });
  if (!prefs.success) return { error: "Please check your preferences." } as const;
  if (prefs.data.categories.length + prefs.data.vendors.length + prefs.data.industries.length === 0) {
    return { error: "Pick at least one topic, company or industry so we know what to send you." } as const;
  }

  const firstTime = !current.onboardedAt;
  await db
    .update(user)
    .set({ ...profile.data, onboardedAt: current.onboardedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(user.id, current.id));
  await db
    .insert(userPreferences)
    .values({ userId: current.id, ...prefs.data })
    .onConflictDoUpdate({ target: userPreferences.userId, set: prefs.data });
  if (firstTime) await track("onboarded", { userId: current.id, metadata: { ...prefs.data } });
  return { firstTime } as const;
}

export async function completeOnboarding(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await save(form);
  if ("error" in result) return { error: result.error };
  redirect("/feed?welcome=1");
}

export async function updateSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await save(form);
  if ("error" in result) return { error: result.error };
  revalidatePath("/feed");
  revalidatePath("/settings");
  return { ok: true, message: "Preferences saved." };
}
