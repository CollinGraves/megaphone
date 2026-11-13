import Link from "next/link";
import { ExternalLink, Layers } from "lucide-react";
import type { Story } from "@/db/schema";
import { categoryLabel, vendorLabel } from "@/lib/taxonomy";
import { cn, timeAgo } from "@/lib/utils";
import { Badge, ImportanceMeter } from "../ui";
import { SaveStoryButton } from "./save-button";

export function StoryCard({
  story,
  saved,
  showSave = false,
  compact = false,
}: {
  story: Story;
  saved?: boolean;
  showSave?: boolean;
  compact?: boolean;
}) {
  return (
    <article className={cn("group rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm", compact && "p-4")}>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ImportanceMeter value={story.importance} />
        <span className="truncate">{story.primarySourceName}</span>
        <span aria-hidden>·</span>
        <time dateTime={story.publishedAt.toISOString()} className="shrink-0">
          {timeAgo(story.publishedAt)}
        </time>
        {story.articleCount > 1 ? (
          <span className="ml-1 inline-flex shrink-0 items-center gap-1 text-slate-500" title="Number of sources covering this story">
            <Layers className="size-3.5" /> {story.articleCount} sources
          </span>
        ) : null}
        {showSave ? (
          <span className="ml-auto">
            <SaveStoryButton storyId={story.id} saved={Boolean(saved)} />
          </span>
        ) : null}
      </div>
      <h3 className={cn("mt-2 font-semibold leading-snug text-slate-900", compact ? "text-[15px]" : "text-lg")}>
        <Link href={`/radar/${story.slug}`} className="hover:text-radar-700">
          {story.title}
        </Link>
      </h3>
      {!compact && story.summary.trim() !== story.title.trim() ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{story.summary}</p>
      ) : null}
      {!compact && story.whyItMatters ? (
        <p className="mt-3 border-l-2 border-radar-400 pl-3 text-sm leading-relaxed text-slate-700">
          <span className="font-medium text-slate-900">Why it matters: </span>
          {story.whyItMatters}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {story.categories.slice(0, 3).map((c) => (
          <Link key={c} href={`/radar/topics/${c}`}>
            <Badge tone="neutral" className="hover:bg-slate-200">
              {categoryLabel(c)}
            </Badge>
          </Link>
        ))}
        {story.vendors.slice(0, 3).map((v) => (
          <Link key={v} href={`/radar/vendors/${v}`}>
            <Badge tone="radar" className="hover:bg-radar-100">
              {vendorLabel(v)}
            </Badge>
          </Link>
        ))}
        <a
          href={`/r/${story.id}`}
          target="_blank"
          rel="noopener"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-radar-700"
        >
          Read source <ExternalLink className="size-3" />
        </a>
      </div>
    </article>
  );
}
