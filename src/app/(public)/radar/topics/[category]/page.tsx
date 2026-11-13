import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RadarIndex } from "@/components/stories/radar-index";
import { getCurrentUser } from "@/lib/auth/session";
import { PAGE_SIZE, pageFrom } from "@/lib/pagination";
import { categoryCounts, listStories } from "@/lib/stories";
import { CATEGORIES } from "@/lib/taxonomy";

export async function generateMetadata({ params }: PageProps<"/radar/topics/[category]">): Promise<Metadata> {
  const { category } = await params;
  const c = CATEGORIES.find((x) => x.slug === category);
  if (!c) return {};
  return {
    title: `${c.label} — latest AI news`,
    description: `The latest AI news on ${c.label.toLowerCase()}: ${c.description.toLowerCase()}.`,
    alternates: { canonical: `/radar/topics/${c.slug}` },
  };
}

export default async function TopicPage({ params, searchParams }: PageProps<"/radar/topics/[category]">) {
  const { category } = await params;
  const c = CATEGORIES.find((x) => x.slug === category);
  if (!c) notFound();
  const page = pageFrom(await searchParams);
  const [stories, counts, user] = await Promise.all([
    listStories({ categories: [c.slug], sinceDays: 60, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
    categoryCounts(7),
    getCurrentUser(),
  ]);
  return (
    <RadarIndex
      title={c.label}
      description={`${c.description}. The latest stories, newest first.`}
      stories={stories.slice(0, PAGE_SIZE)}
      hasMore={stories.length > PAGE_SIZE}
      page={page}
      basePath={`/radar/topics/${c.slug}`}
      activeCategory={c.slug}
      categoryCounts={counts}
      signedIn={Boolean(user)}
    />
  );
}
