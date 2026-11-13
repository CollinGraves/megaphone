"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { savedStories, stories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export async function toggleSavedStory(storyId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const [story] = await db.select({ id: stories.id }).from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story) return { ok: false };
  const deleted = await db
    .delete(savedStories)
    .where(and(eq(savedStories.userId, user.id), eq(savedStories.storyId, storyId)))
    .returning();
  if (deleted.length === 0) await db.insert(savedStories).values({ userId: user.id, storyId }).onConflictDoNothing();
  revalidatePath("/feed");
  return { ok: true, saved: deleted.length === 0 };
}
