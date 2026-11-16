import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/** Signed-in areas. Visitors without a session cookie are sent to sign-in first. */
const PROTECTED = ["/feed", "/settings", "/onboarding", "/w/", "/admin", "/workspaces"];

const canonicalHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).host : null;
  } catch {
    return null;
  }
})();

/**
 * 1. In production, send page requests on any other host (old *.vercel.app addresses) to the
 *    canonical domain. Sign-in only trusts that origin, and search engines should see one address.
 * 2. Optimistic auth gate: bounce visitors without a session cookie to sign-in, remembering where
 *    they were going. Real authorization happens in layouts, pages and server actions.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  if (process.env.VERCEL_ENV === "production" && canonicalHost && host && host !== canonicalHost) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${canonicalHost}`);
    return NextResponse.redirect(url, 308);
  }

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`));
  if (!isProtected || getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API routes (cron, auth, webhooks keep working on any host) and build assets.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
