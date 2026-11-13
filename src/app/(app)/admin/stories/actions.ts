"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { stories, storyStatus } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";

const idSchema = z.string().min(1).max(64);

async function updateStory(id: string, set: Partial<Pick<typeof stories.$inferInsert, "status" | "featured" | "importance">>) {
  const [updated] = await db
    .update(stories)
    .set({ ...set, updatedAt: new Date() })
    .where(eq(stories.id, id))
    .returning({ slug: stories.slug });
  revalidatePath("/admin/stories");
  if (updated) {
    // Public surfaces that list or render stories.
    revalidatePath(`/radar/${updated.slug}`);
    revalidatePath("/radar");
    revalidatePath("/feed");
    revalidatePath("/");
  }
}

export async function setStoryStatus(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { id, status } = z
    .object({ id: idSchema, status: z.enum(storyStatus.enumValues) })
    .parse({ id: form.get("id"), status: form.get("status") });
  await updateStory(id, { status });
}

export async function setStoryFeatured(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { id, featured } = z
    .object({ id: idSchema, featured: z.enum(["1", "0"]) })
    .parse({ id: form.get("id"), featured: form.get("featured") });
  await updateStory(id, { featured: featured === "1" });
}

export async function setStoryImportance(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { id, importance } = z
    .object({ id: idSchema, importance: z.coerce.number().int().min(1).max(5) })
    .parse({ id: form.get("id"), importance: form.get("importance") });
  await updateStory(id, { importance });
}
