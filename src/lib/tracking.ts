import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { engagementEvents } from "@/db/schema";

export type EngagementType =
  | "signup"
  | "onboarded"
  | "story_view"
  | "story_click"
  | "digest_open"
  | "digest_click"
  | "cta_click"
  | "contact_request"
  | "colleague_invite"
  | "assessment_started"
  | "assessment_completed";

export async function track(
  type: EngagementType,
  opts: { userId?: string | null; storyId?: string | null; metadata?: Record<string, unknown> } = {},
) {
  try {
    await db.insert(engagementEvents).values({
      type,
      userId: opts.userId ?? null,
      storyId: opts.storyId ?? null,
      metadata: opts.metadata ?? null,
    });
  } catch (err) {
    // Tracking must never break the user-facing request.
    console.error("[track] failed", err);
  }
}

const secret = () => process.env.BETTER_AUTH_SECRET ?? "dev-secret";

/** Signed user token for email links (digest opens/clicks) so we can attribute without a session. */
export function signUserToken(userId: string) {
  const sig = createHmac("sha256", secret()).update(`u:${userId}`).digest("base64url").slice(0, 22);
  return `${userId}.${sig}`;
}

export function verifyUserToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = token.slice(0, i);
  const expected = signUserToken(userId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}
