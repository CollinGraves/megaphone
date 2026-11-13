import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { SubmitButton } from "@/components/forms";
import { ImportanceMeter } from "@/components/ui";
import { categoryLabel } from "@/lib/taxonomy";
import { timeAgo } from "@/lib/utils";
import { dismissAlert } from "../alerts/actions";
import type { OpenAlert } from "../_lib/alerts";
import { InlineForm } from "./client";

export function AlertList({
  alerts,
  slug,
  canDismiss,
  showInitiative = true,
  showSummary = true,
}: {
  alerts: OpenAlert[];
  slug: string;
  canDismiss: boolean;
  showInitiative?: boolean;
  showSummary?: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-100">
      {alerts.map((a) => (
        <li key={a.id} className="flex gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <ImportanceMeter value={a.storyImportance} />
              {a.storyCategories.slice(0, 3).map((c) => (
                <span key={c} className="font-medium text-amber-700">
                  {categoryLabel(c)}
                </span>
              ))}
              <span>
                · {a.storySource ? `${a.storySource} · ` : ""}
                {timeAgo(a.storyPublishedAt)}
              </span>
            </div>
            <Link href={`/radar/${a.storySlug}`} className="mt-1 inline-flex items-start gap-1 text-sm font-semibold text-slate-900 hover:text-radar-700 hover:underline">
              {a.storyTitle}
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
            </Link>
            {showSummary ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.storySummary}</p> : null}
            <p className="mt-1.5 text-xs text-slate-500">
              {showInitiative ? (
                <>
                  <Link href={`/w/${slug}/initiatives/${a.initiativeId}`} className="font-medium text-slate-800 hover:underline">
                    {a.initiativeTitle}
                  </Link>
                  {" — "}
                </>
              ) : null}
              {a.reason}
            </p>
          </div>
          {canDismiss ? (
            <InlineForm action={dismissAlert} className="shrink-0 self-start">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="id" value={a.id} />
              <SubmitButton variant="ghost" size="sm" pendingText="…">
                <X className="size-3.5" /> Dismiss
              </SubmitButton>
            </InlineForm>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
