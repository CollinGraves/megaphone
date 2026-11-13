import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Hammer } from "lucide-react";
import { StoryCard } from "@/components/stories/story-card";
import { ButtonLink, Card } from "@/components/ui";
import { BRAND_COMPANY, SHOW_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/env";
import { parseNotes, youtubeId, type NotesPart } from "@/lib/show/rundown";
import { episodeStories, getPublishedEpisode } from "@/lib/show/server";
import { formatDate } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/show/[slug]">): Promise<Metadata> {
  const ep = await getPublishedEpisode((await params).slug);
  if (!ep) return {};
  const description = (ep.showNotes ?? "").split("\n")[0].slice(0, 300) || `Episode ${ep.number} of ${SHOW_NAME}.`;
  const vid = youtubeId(ep.videoUrl);
  return {
    title: `${ep.title} · ${SHOW_NAME}`,
    description,
    alternates: { canonical: `/show/${ep.slug}` },
    openGraph: {
      title: ep.title,
      description,
      type: "video.episode",
      ...(vid ? { images: [`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`] } : {}),
    },
    twitter: { card: vid ? "summary_large_image" : "summary", title: ep.title, description },
  };
}

function Parts({ parts }: { parts: NotesPart[] }) {
  return parts.map((p, i) =>
    "url" in p ? (
      <a key={i} href={p.url} className="break-all text-radar-700 hover:underline" rel={p.url.startsWith(appUrl()) ? undefined : "noopener noreferrer nofollow"}>
        {p.url.startsWith(appUrl()) ? p.url.slice(appUrl().length) || "/" : p.url}
      </a>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

export default async function EpisodePage({ params }: PageProps<"/show/[slug]">) {
  const ep = await getPublishedEpisode((await params).slug);
  if (!ep) notFound();
  const list = await episodeStories(ep);
  const vid = youtubeId(ep.videoUrl);
  const notes = parseNotes(ep.showNotes ?? "");
  const url = `${appUrl()}/show/${ep.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Episode",
    name: ep.title,
    episodeNumber: ep.number,
    datePublished: ep.airDate,
    url,
    description: (ep.showNotes ?? "").slice(0, 500),
    partOfSeries: { "@type": "CreativeWorkSeries", name: SHOW_NAME, url: `${appUrl()}/show` },
    publisher: { "@type": "Organization", name: BRAND_COMPANY },
    ...(vid
      ? {
          video: {
            "@type": "VideoObject",
            name: ep.title,
            description: (ep.showNotes ?? ep.title).slice(0, 500),
            uploadDate: ep.airDate,
            thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
            embedUrl: `https://www.youtube-nocookie.com/embed/${vid}`,
            contentUrl: ep.videoUrl,
          },
        }
      : {}),
    mentions: list.map((s) => ({ "@type": "NewsArticle", headline: s.title, url: `${appUrl()}/radar/${s.slug}` })),
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href="/show" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" /> {SHOW_NAME}
      </Link>
      <div className="mt-4 text-sm text-slate-500">
        Episode {ep.number} · {formatDate(ep.airDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </div>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">{ep.title}</h1>

      {vid ? (
        <div className="mt-6 aspect-video overflow-hidden rounded-xl bg-ink-950">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${vid}`}
            title={ep.title}
            className="size-full"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : ep.videoUrl ? (
        <a href={ep.videoUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-1 text-radar-700 hover:underline">
          Watch the episode <ExternalLink className="size-4" />
        </a>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-8">
          {notes.length ? (
            <section className="space-y-3 text-[15px] leading-relaxed text-slate-700">
              {notes.map((b, i) =>
                b.type === "p" ? (
                  <p key={i}>
                    <Parts parts={b.parts} />
                  </p>
                ) : (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {b.items.map((item, j) => (
                      <li key={j}>
                        <Parts parts={item} />
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ) : null}
          {list.length ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Stories in this episode</h2>
              <div className="space-y-3">
                {list.map((s) => (
                  <StoryCard key={s.id} story={s} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="space-y-4">
          <Card className="p-5">
            <div className="font-semibold text-slate-900">Get the radar daily</div>
            <p className="mt-1 text-sm text-slate-600">The stories that matter for your stack, every morning. Free with a work email.</p>
            <ButtonLink href="/sign-up?src=show_episode" size="sm" className="mt-3 w-full">
              Sign up free
            </ButtonLink>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Hammer className="size-4 text-radar-600" /> Want it built?
            </div>
            <p className="mt-1 text-sm text-slate-600">{BRAND_COMPANY} turns ideas like the ones on the show into working AI for mid-market teams.</p>
            <ButtonLink href={`/contact?from=show&episode=${ep.slug}`} size="sm" variant="secondary" className="mt-3 w-full">
              Talk to {BRAND_COMPANY}
            </ButtonLink>
          </Card>
        </aside>
      </div>
    </div>
  );
}
