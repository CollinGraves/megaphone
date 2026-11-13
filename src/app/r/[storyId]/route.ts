import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { stories } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import { track, verifyUserToken } from "@/lib/tracking";

/** Outbound click redirect: records the click (feed or digest) then sends the reader to the source. */
export async function GET(request: NextRequest, ctx: RouteContext<"/r/[storyId]">) {
  const { storyId } = await ctx.params;
  const [story] = await db.select({ id: stories.id, url: stories.primaryUrl }).from(stories).where(eq(stories.id, storyId)).limit(1);
  if (!story) return NextResponse.redirect(new URL("/radar", appUrl()));

  const tokenUser = verifyUserToken(request.nextUrl.searchParams.get("u"));
  const fromDigest = request.nextUrl.searchParams.get("src") === "digest";
  const userId = tokenUser ?? (await getCurrentUser())?.id ?? null;
  await track(fromDigest ? "digest_click" : "story_click", { userId, storyId: story.id });
  return NextResponse.redirect(story.url, 302);
}
