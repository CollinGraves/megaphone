import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth gate: bounce visitors without a session cookie to sign-in, remembering where they
 * were going. Real authorization happens in layouts, pages and server actions.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/feed/:path*", "/settings/:path*", "/onboarding/:path*", "/w/:path*", "/admin/:path*"],
};
