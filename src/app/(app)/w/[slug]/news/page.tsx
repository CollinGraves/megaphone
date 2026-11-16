import Link from "next/link";
import { Newspaper } from "lucide-react";
import type { Metadata } from "next";
import { StoryCard } from "@/components/stories/story-card";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { listStories } from "@/lib/stories";
import { vendorLabel } from "@/lib/taxonomy";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { usedByLabel, workspaceVendors } from "@/lib/workspace-news";

export const metadata: Metadata = { title: "News" };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export default async function WorkspaceNewsPage({ params }: PageProps<"/w/[slug]/news">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;
  const vendors = await workspaceVendors(ctx.org.id);
  const usedBy = new Map(vendors.map((v) => [v.vendor, v.projects]));
  const stories = vendors.length
    ? await listStories({ vendors: vendors.map((v) => v.vendor), sinceDays: 30, minImportance: 2, order: "recent", limit: 40 })
    : [];
  const top = stories.length ? [] : await listStories({ sinceDays: 7, order: "top", limit: 8 });

  return (
    <>
      <PageHeader
        eyebrow="News"
        title="News about your AI tools"
        description={
          vendors.length
            ? `Stories from the last 30 days about the AI tools your projects use: ${list(vendors.slice(0, 6).map((v) => vendorLabel(v.vendor)))}${vendors.length > 6 ? " and more" : ""}.`
            : "Stories about the AI tools your projects use show up here."
        }
        actions={
          <ButtonLink href={`${base}/alerts`} variant="secondary">
            Radar alerts
          </ButtonLink>
        }
      />
      {vendors.length === 0 ? (
        <EmptyState
          icon={<Newspaper className="size-8" />}
          title="No AI tools listed yet"
          description="Add the AI tools each project uses (like OpenAI, Microsoft or Anthropic), and news about them shows up here."
          action={
            <ButtonLink href={`${base}/initiatives`} variant="secondary">
              Go to AI projects
            </ButtonLink>
          }
        />
      ) : stories.length === 0 ? (
        <EmptyState icon={<Newspaper className="size-8" />} title="Quiet month" description="No news about your AI tools in the last 30 days." />
      ) : (
        <div className="space-y-3">
          {stories.map((s) => {
            const v = s.vendors.find((x) => usedBy.has(x));
            return <StoryCard key={s.id} story={s} compact reason={v ? `${vendorLabel(v)}: ${usedByLabel(usedBy.get(v)!)}` : undefined} />;
          })}
        </div>
      )}
      {top.length ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Top AI news this week</h2>
          <div className="space-y-3">
            {top.map((s) => (
              <StoryCard key={s.id} story={s} compact />
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-6 text-sm text-slate-500">
        Looking for everything else?{" "}
        <Link href="/news" className="text-radar-700 hover:underline">
          See all AI news
        </Link>
        .
      </p>
    </>
  );
}
