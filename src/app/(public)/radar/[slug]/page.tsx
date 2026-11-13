import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { StoryCard } from "@/components/stories/story-card";
import { StoryTimeline } from "@/components/stories/story-timeline";
import { getStackContext, stackReasons, storyContext } from "@/lib/graph/personalize";
import { Badge, ButtonLink, Card, ImportanceMeter } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import { episodesForStory } from "@/lib/show/server";
import { getRelatedStories, getStoryBySlug } from "@/lib/stories";
import { categoryLabel, industryLabel, vendorLabel } from "@/lib/taxonomy";
import { track } from "@/lib/tracking";
import { formatDate, timeAgo } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export async function generateMetadata({ params }: PageProps<"/radar/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await getStoryBySlug(slug);
  if (!found) return {};
  const { story } = found;
  return {
    title: story.title,
    description: story.summary.slice(0, 300),
    alternates: { canonical: `/radar/${story.slug}` },
    openGraph: { title: story.title, description: story.summary, type: "article", publishedTime: story.publishedAt.toISOString() },
    twitter: { card: "summary", title: story.title, description: story.summary },
  };
}

export default async function StoryPage({ params }: PageProps<"/radar/[slug]">) {
  const { slug } = await params;
  const found = await getStoryBySlug(slug);
  if (!found) notFound();
  const { story, coverage } = found;
  const [related, user, graph, onShow] = await Promise.all([getRelatedStories(story), getCurrentUser(), storyContext(story.id), episodesForStory(story.id)]);
  const stack = user ? await getStackContext(user) : null;
  const reason = (await stackReasons([story], stack)).get(story.id);
  await track("story_view", { userId: user?.id, storyId: story.id });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: story.title,
    description: story.summary,
    datePublished: story.publishedAt.toISOString(),
    dateModified: story.updatedAt.toISOString(),
    mainEntityOfPage: `${appUrl()}/radar/${story.slug}`,
    publisher: { "@type": "Organization", name: "North Labs" },
    isBasedOn: coverage.map((c) => c.url),
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href="/radar" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Top stories
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_320px]">
        <article>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <ImportanceMeter value={story.importance} />
            <time dateTime={story.publishedAt.toISOString()}>{formatDate(story.publishedAt)}</time>
            <span aria-hidden>·</span>
            <span>
              Covered by {story.articleCount} source{story.articleCount === 1 ? "" : "s"}
            </span>
          </div>
          {reason ? (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-radar-50 px-2 py-1 text-sm font-medium text-radar-800">{reason}</div>
          ) : null}
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-4xl">{story.title}</h1>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {story.categories.map((c) => (
              <Link key={c} href={`/radar/topics/${c}`}>
                <Badge>{categoryLabel(c)}</Badge>
              </Link>
            ))}
            {story.vendors.map((v) => (
              <Link key={v} href={`/radar/vendors/${v}`}>
                <Badge tone="radar">{vendorLabel(v)}</Badge>
              </Link>
            ))}
            {story.industries.map((i) => (
              <Badge key={i} tone="blue">
                {industryLabel(i)}
              </Badge>
            ))}
          </div>
          <div className="prose-radar mt-6 text-lg leading-relaxed text-slate-700">
            <p>{story.summary}</p>
          </div>
          {story.whyItMatters ? (
            <Card className="mt-6 border-radar-200 bg-radar-50/60 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-radar-800">Why it matters</h2>
              <p className="mt-2 leading-relaxed text-slate-800">{story.whyItMatters}</p>
            </Card>
          ) : null}
          <div className="mt-6">
            <ButtonLink href={`/r/${story.id}`} target="_blank" rel="noopener" variant="primary">
              Read the original at {story.primarySourceName} <ExternalLink className="size-4" />
            </ButtonLink>
          </div>

          <StoryTimeline ctx={graph} />

          {coverage.length > 1 ? (
            <section className="mt-10">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coverage</h2>
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {coverage.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <a href={c.url} target="_blank" rel="noopener" className="text-sm font-medium text-slate-900 hover:text-radar-700">
                        {c.title}
                      </a>
                      <div className="text-xs text-slate-500">{c.sourceName}</div>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(c.publishedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </article>

        <aside className="space-y-6">
          {onShow.length ? (
            <div className="rounded-xl border border-radar-200 bg-radar-50 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-radar-800">Discussed on the show</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {onShow.map((e) => (
                  <li key={e.slug}>
                    <Link href={`/show/${e.slug}`} className="font-medium text-slate-900 hover:text-radar-700">
                      Ep. {e.number}: {e.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!user ? (
            <div className="rounded-xl bg-ink-900 p-5 text-white">
              <h2 className="font-semibold">Stories like this, filtered for you</h2>
              <p className="mt-1.5 text-sm text-slate-300">
                {BRAND} watches hundreds of sources and sends you only what matters to your role and industry.
              </p>
              <ButtonLink href="/sign-up?src=story_sidebar" variant="accent" className="mt-4 w-full">
                Get your free radar
              </ButtonLink>
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">What does this mean for your company?</h2>
            <p className="mt-1.5 text-sm text-slate-600">
              North Labs helps teams turn AI news into a prioritized roadmap, and track the impact of every initiative.
            </p>
            <ButtonLink href={`/contact?from=story&story=${story.slug}`} variant="secondary" className="mt-4 w-full">
              Talk to North Labs
            </ButtonLink>
          </div>
          {related.length ? (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Related</h2>
              <div className="space-y-3">
                {related.map((r) => (
                  <StoryCard key={r.id} story={r} compact />
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
