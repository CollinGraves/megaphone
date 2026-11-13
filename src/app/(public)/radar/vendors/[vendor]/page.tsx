import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadarIndex } from "@/components/stories/radar-index";
import { getCurrentUser } from "@/lib/auth/session";
import { PAGE_SIZE, pageFrom } from "@/lib/pagination";
import { categoryCounts, listStories } from "@/lib/stories";
import { VENDORS } from "@/lib/taxonomy";

export async function generateMetadata({ params }: PageProps<"/radar/vendors/[vendor]">): Promise<Metadata> {
  const { vendor } = await params;
  const v = VENDORS.find((x) => x.slug === vendor);
  if (!v) return {};
  return {
    title: `${v.label} AI news`,
    description: `Every significant ${v.label} AI announcement — models, products, pricing and partnerships — in one place.`,
    alternates: { canonical: `/radar/vendors/${v.slug}` },
  };
}

export default async function VendorPage({ params, searchParams }: PageProps<"/radar/vendors/[vendor]">) {
  const { vendor } = await params;
  const v = VENDORS.find((x) => x.slug === vendor);
  if (!v) notFound();
  const page = pageFrom(await searchParams);
  const [stories, counts, user] = await Promise.all([
    listStories({ vendors: [v.slug], sinceDays: 90, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
    categoryCounts(7),
    getCurrentUser(),
  ]);
  return (
    <RadarIndex
      title={`${v.label} AI news`}
      description={`Models, products, pricing and partnerships from ${v.label}, newest first.`}
      stories={stories.slice(0, PAGE_SIZE)}
      hasMore={stories.length > PAGE_SIZE}
      page={page}
      basePath={`/radar/vendors/${v.slug}`}
      activeVendor={v.slug}
      categoryCounts={counts}
      signedIn={Boolean(user)}
    />
  );
}
