import type { NextRequest } from "next/server";
import { track, verifyUserToken } from "@/lib/tracking";

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Digest open pixel. */
export async function GET(request: NextRequest) {
  const userId = verifyUserToken(request.nextUrl.searchParams.get("u"));
  if (userId) await track("digest_open", { userId, metadata: { digestId: request.nextUrl.searchParams.get("d") } });
  return new Response(PIXEL, {
    headers: { "content-type": "image/gif", "cache-control": "no-store, max-age=0" },
  });
}
