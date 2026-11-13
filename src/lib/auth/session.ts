import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

export type CurrentUser = typeof user.$inferSelect;

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [row] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  return row ?? null;
});

export async function requireUser(next?: string): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return current;
}

/** North Labs staff (admins and consultants). */
export async function requireStaff(): Promise<CurrentUser> {
  const current = await requireUser("/admin");
  if (current.platformRole !== "admin" && current.platformRole !== "consultant") redirect("/feed");
  return current;
}

export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const current = await requireUser("/admin");
  if (current.platformRole !== "admin") redirect("/admin");
  return current;
}
