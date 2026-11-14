import type { Metadata } from "next";
import { RadarIndex } from "@/components/stories/radar-index";
import { getCurrentUser } from "@/lib/auth/session";
import { PAGE_SIZE, pageFrom } from "@/lib/pagination";
import { categoryCounts, listStories } from "@/lib/stories";

export const metadata: Metadata = {
  title: "Top AI stories this week",
  description: "This week's most important AI news: new AI models, price changes, new laws, how companies use AI, and research.",
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
      description="AI news from the last seven days. Stories that matter more, and that more outlets cover, rank higher. We update this list every hour."
      stories={stories.slice(0, PAGE_SIZE)}
      hasMore={stories.length > PAGE_SIZE}
      page={page}
      basePath="/radar"
      categoryCounts={counts}
      signedIn={Boolean(user)}
    />
  );
}
