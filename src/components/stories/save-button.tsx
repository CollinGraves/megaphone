"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { toggleSavedStory } from "@/app/(app)/feed/actions";
import { cn } from "@/lib/utils";

export function SaveStoryButton({ storyId, saved }: { storyId: string; saved: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, start] = useTransition();
  const Icon = optimistic ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? "Remove from saved" : "Save story"}
      className={cn("rounded-md p-1 hover:bg-slate-100", optimistic ? "text-radar-600" : "text-slate-400 hover:text-slate-700")}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          await toggleSavedStory(storyId);
        })
      }
    >
      <Icon className="size-4" />
    </button>
  );
}
