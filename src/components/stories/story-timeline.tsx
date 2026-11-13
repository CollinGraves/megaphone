import Link from "next/link";
import { GitCommitHorizontal, History } from "lucide-react";
import type { storyContext } from "@/lib/graph/personalize";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "../ui";

type Ctx = Awaited<ReturnType<typeof storyContext>>;

const PHRASE: Record<string, string> = {
  price: "pricing",
  retires_on: "retires",
  deprecated_on: "deprecated",
  effective_on: "takes effect",
  available_on: "available",
  adopted: "adopted",
  supersedes: "replaces",
};

/** What the knowledge graph knows around this story: arcs, dated facts (current and superseded), related coverage. */
export function StoryTimeline({ ctx }: { ctx: Ctx }) {
  const { facts, timeline, links, entities } = ctx;
  if (!facts.length && !timeline.length && !links.length) return null;
  const names = entities.filter((e) => e.kind !== "vendor").slice(0, 3).map((e) => e.name);
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <History className="size-4" /> Timeline{names.length ? `: ${names.join(", ")}` : ""}
      </h2>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
        {links.length ? (
          <ul className="mb-4 space-y-1.5">
            {links.map((l) => (
              <li key={`${l.slug}-${l.direction}`} className="text-sm">
                <Badge tone={l.direction === "later" ? "amber" : "neutral"}>{l.direction === "later" ? "Newer update" : "Updates earlier story"}</Badge>{" "}
                <Link href={`/radar/${l.slug}`} className="font-medium text-slate-900 hover:text-radar-700">
                  {l.title}
                </Link>{" "}
                <span className="text-xs text-slate-500">{formatDate(l.publishedAt)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {facts.length ? (
          <ol className="relative space-y-3 border-l border-slate-200 pl-5">
            {facts.map(({ fact, subjectName, objectName, storySlug }) => {
              const superseded = Boolean(fact.supersededById);
              return (
                <li key={fact.id} className="relative">
                  <GitCommitHorizontal className={cn("absolute -left-[29px] top-0.5 size-4 rounded-full bg-white", superseded ? "text-slate-300" : "text-radar-600")} />
                  <div className={cn("text-sm", superseded ? "text-slate-400 line-through decoration-slate-300" : "text-slate-800")}>
                    <span className="font-medium">{subjectName}</span> {PHRASE[fact.predicate] ?? fact.predicate}
                    {objectName ? <> {objectName}</> : null}
                    {fact.value ? <>: {fact.value}</> : null}
                    {fact.validFrom ? <> · {formatDate(fact.validFrom)}</> : null}
                  </div>
                  <div className="text-xs text-slate-500">
                    {superseded ? `Superseded${fact.validTo ? ` ${formatDate(fact.validTo)}` : ""}` : "Current"} · reported {formatDate(fact.observedAt)}
                    {storySlug ? (
                      <>
                        {" "}
                        ·{" "}
                        <Link href={`/radar/${storySlug}`} className="text-radar-700 hover:underline">
                          source story
                        </Link>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
        {timeline.length ? (
          <div className={cn(facts.length || links.length ? "mt-4 border-t border-slate-100 pt-4" : "")}>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Earlier coverage</div>
            <ul className="space-y-1.5">
              {timeline.map((t) => (
                <li key={t.id} className="flex justify-between gap-3 text-sm">
                  <Link href={`/radar/${t.slug}`} className="text-slate-800 hover:text-radar-700">
                    {t.title}
                  </Link>
                  <span className="shrink-0 text-xs text-slate-400">{formatDate(t.publishedAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
