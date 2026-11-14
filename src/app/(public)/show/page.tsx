import type { Metadata } from "next";
import Link from "next/link";
import { Mic, PlayCircle } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { BRAND_COMPANY, SHOW_HOST, SHOW_NAME, SHOW_TAGLINE } from "@/lib/brand";
import { listEpisodes } from "@/lib/show/server";
import { youtubeId } from "@/lib/show/rundown";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: SHOW_NAME,
  description: `${SHOW_TAGLINE} A video show about the week's AI news, what it means for mid-size companies, and a viewer's AI idea built live.`,
  alternates: { canonical: "/show" },
};

export default async function ShowPage() {
  const list = await listEpisodes({ publishedOnly: true, limit: 60 });
  return (
    <div>
      <section className="bg-ink-950 text-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-radar-300">
            <Mic className="size-3.5" /> New episodes every week
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{SHOW_NAME}</h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-300">{SHOW_TAGLINE}</p>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            A video show about the week&apos;s AI news and what it means for companies with 200 to 2,000 people. In each episode, we also build a
            viewer&apos;s AI idea live. Hosted by {SHOW_HOST} at {BRAND_COMPANY}.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/sign-up?src=show" variant="accent">
              Get AI news by email, free
            </ButtonLink>
            <ButtonLink href="/contact?from=show" variant="secondary">
              Send us an idea to build on the show
            </ButtonLink>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Episodes</h2>
        {list.length ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {list.map((ep) => (
              <li key={ep.id}>
                <Link href={`/show/${ep.slug}`} className="group block h-full">
                  <Card className="flex h-full gap-4 p-5 transition-shadow group-hover:shadow-md">
                    <PlayCircle className={`size-8 shrink-0 ${youtubeId(ep.videoUrl) ? "text-radar-600" : "text-slate-300"}`} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">
                        Episode {ep.number} · {formatDate(ep.airDate)}
                      </div>
                      <div className="mt-0.5 font-semibold text-slate-900 group-hover:text-radar-700">{ep.title}</div>
                      {ep.showNotes ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{ep.showNotes.split("\n")[0]}</p> : null}
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-slate-600">
            The first episode is coming soon. <Link href="/sign-up?src=show" className="text-radar-700 hover:underline">Sign up</Link> to get it in your
            inbox.
          </p>
        )}
      </section>
    </div>
  );
}
