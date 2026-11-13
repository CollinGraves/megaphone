import type { MetadataRoute } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { stories } from "@/db/schema";
import { appUrl } from "@/lib/env";
import { CATEGORIES, VENDORS } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const recent = await db
    .select({ slug: stories.slug, updatedAt: stories.updatedAt })
    .from(stories)
    .where(eq(stories.status, "published"))
    .orderBy(desc(stories.publishedAt))
    .limit(5000);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/radar`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/assessment`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/contact`, changeFrequency: "monthly", priority: 0.5 },
    ...CATEGORIES.map((c) => ({ url: `${base}/radar/topics/${c.slug}`, changeFrequency: "hourly" as const, priority: 0.7 })),
    ...VENDORS.map((v) => ({ url: `${base}/radar/vendors/${v.slug}`, changeFrequency: "daily" as const, priority: 0.6 })),
    ...recent.map((s) => ({ url: `${base}/radar/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
