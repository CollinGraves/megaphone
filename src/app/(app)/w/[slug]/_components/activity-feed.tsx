import Link from "next/link";
import { timeAgo } from "@/lib/utils";
import { describeActivity, type ActivityRow } from "../_lib/activity";

export function ActivityFeed({ rows, slug, showInitiative = true }: { rows: ActivityRow[]; slug: string; showInitiative?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-slate-300" aria-hidden />
          <div className="min-w-0">
            <p className="text-slate-700">
              <span className="font-medium text-slate-900">{r.userName ?? (typeof r.detail?.submitterName === "string" ? r.detail.submitterName : "Someone")}</span> {describeActivity(r.action, r.detail)}
              {showInitiative && r.initiativeId && r.initiativeTitle ? (
                <>
                  {" "}
                  on{" "}
                  <Link href={`/w/${slug}/initiatives/${r.initiativeId}`} className="font-medium text-slate-900 hover:text-radar-700 hover:underline">
                    {r.initiativeTitle}
                  </Link>
                </>
              ) : null}
            </p>
            <time className="text-xs text-slate-500" dateTime={r.createdAt.toISOString()}>
              {timeAgo(r.createdAt)}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
