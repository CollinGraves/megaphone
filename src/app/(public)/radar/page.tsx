import type { Metadata } from "next";
import { RadarIndex } from "@/components/stories/radar-index";
import { getCurrentUser } from "@/lib/auth/session";
import { PAGE_SIZE, pageFrom } from "@/lib/pagination";
import { categoryCounts, listStories } from "@/lib/stories";

export const metadata: Metadata = {
  title: "Top AI stories this week",
  description: "The most important AI announcements of the week — model releases, pricing changes, regulation, enterprise adoption and research — curated from hundreds of sources.",
  alternates: { canonical: "/radar" },
};

export default async function RadarPage({ searchParams }: PageProps<"/radar">) {
  const page = pageFrom(await searchParams);
  const [stories, counts, user] = await Promise.all([
    listStories({ sinceDays: 7, minImportance: 2, order: "top", limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE }),
    categoryCounts(7),
    getCurrentUser(),
  ]);
  return (
    <RadarIndex
      title="Top AI stories this week"
      description="What actually mattered in AI over the last seven days, ranked by significance and how widely it was covered. Updated every hour from hundreds of sources."
      stories={stories.slice(0, PAGE_SIZE)}
      hasMore={stories.length > PAGE_SIZE}
      page={page}
      basePath="/radar"
      categoryCounts={counts}
      signedIn={Boolean(user)}
    />
  );
}
