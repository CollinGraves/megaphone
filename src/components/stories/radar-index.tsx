import Link from "next/link";
import type { Story } from "@/db/schema";
import { CATEGORIES, VENDORS } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { ButtonLink, EmptyState } from "../ui";
import { StoryCard } from "./story-card";

/** Public story listing with topic navigation and a sign-up CTA (used by /radar, topics and vendors). */
export function RadarIndex({
  title,
  description,
  stories,
  activeCategory,
  activeVendor,
  categoryCounts,
  signedIn,
  page,
  hasMore,
  basePath,
}: {
  title: string;
  description: string;
  stories: Story[];
  activeCategory?: string;
  activeVendor?: string;
  categoryCounts: Record<string, number>;
  signedIn: boolean;
  page: number;
  hasMore: boolean;
  basePath: string;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">{description}</p>
      </div>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {stories.length === 0 ? (
            <EmptyState title="Nothing here yet" description="New stories arrive every hour. Check back soon." />
          ) : (
            stories.map((s, i) => (
              <div key={s.id}>
                <StoryCard story={s} />
                {!signedIn && i === 4 ? <InlineCta /> : null}
              </div>
            ))
          )}
          <div className="flex justify-between pt-2">
            {page > 1 ? (
              <ButtonLink variant="secondary" href={`${basePath}?page=${page - 1}`}>
                ← Newer
              </ButtonLink>
            ) : (
              <span />
            )}
            {hasMore ? (
              <ButtonLink variant="secondary" href={`${basePath}?page=${page + 1}`}>
                Older →
              </ButtonLink>
            ) : null}
          </div>
        </div>
        <aside className="space-y-6">
          {!signedIn ? (
            <div className="rounded-xl bg-ink-900 p-5 text-white">
              <h2 className="font-semibold">Get your personal AI radar</h2>
              <p className="mt-1.5 text-sm text-slate-300">
                Pick the topics and vendors you care about. We&apos;ll send a short digest with only what matters to you.
              </p>
              <ButtonLink href="/sign-up" variant="accent" className="mt-4 w-full">
                Create a free account
              </ButtonLink>
            </div>
          ) : null}
          <nav>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Topics</h2>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href="/radar"
                  className={cn("flex justify-between rounded-md px-2 py-1.5 text-sm hover:bg-slate-100", !activeCategory && !activeVendor && "bg-slate-100 font-medium")}
                >
                  All top stories
                </Link>
              </li>
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/radar/topics/${c.slug}`}
                    className={cn(
                      "flex justify-between rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100",
                      activeCategory === c.slug && "bg-slate-100 font-medium text-slate-900",
                    )}
                  >
                    {c.label}
                    <span className="text-xs text-slate-400 tabular-nums">{categoryCounts[c.slug] ?? 0}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Companies</h2>
            <div className="flex flex-wrap gap-1.5">
              {VENDORS.map((v) => (
                <Link
                  key={v.slug}
                  href={`/radar/vendors/${v.slug}`}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    activeVendor === v.slug ? "border-radar-600 bg-radar-50 text-radar-900" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </div>
          </nav>
        </aside>
      </div>
    </div>
  );
}

function InlineCta() {
  return (
    <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-radar-200 bg-radar-50 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="font-semibold text-slate-900">Too much to keep up with?</div>
        <div className="text-sm text-slate-600">Get a personalized weekly digest. Free, takes 30 seconds.</div>
      </div>
      <ButtonLink href="/sign-up" variant="primary">
        Personalize my radar
      </ButtonLink>
    </div>
  );
}
