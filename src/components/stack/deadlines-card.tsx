import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { daysUntil, deadlineLabel, type Deadline } from "@/lib/graph/personalize";
import { cn, formatDate } from "@/lib/utils";
import { Card } from "../ui";

export function DeadlinesCard({ deadlines, companyName }: { deadlines: Deadline[]; companyName?: string }) {
  if (deadlines.length === 0) return null;
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <CalendarClock className="size-4 text-amber-600" /> Upcoming deadlines
      </h2>
      <ul className="mt-3 space-y-3">
        {deadlines.map((d) => {
          const days = daysUntil(d.date);
          return (
            <li key={d.factId} className="flex gap-3">
              <div
                className={cn(
                  "flex w-12 shrink-0 flex-col items-center rounded-md border py-1 text-center",
                  days <= 30 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 text-slate-700",
                )}
              >
                <span className="text-sm font-semibold tabular-nums">{days}</span>
                <span className="text-[10px] uppercase">days</span>
              </div>
              <div className="min-w-0 text-sm">
                <div className="text-slate-900">
                  <span className="font-medium">{d.entityName}</span> {deadlineLabel(d.predicate)}
                </div>
                <div className="text-xs text-slate-500">
                  {formatDate(d.date)}
                  {d.inStack && companyName ? ` · ${companyName} uses this` : ""}
                </div>
                {d.storySlug ? (
                  <Link href={`/radar/${d.storySlug}`} className="text-xs text-radar-700 hover:underline">
                    Details →
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
