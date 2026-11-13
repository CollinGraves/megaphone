import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/radar"], disallow: ["/feed", "/w/", "/admin", "/settings", "/onboarding", "/invite/", "/api/", "/r/"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
