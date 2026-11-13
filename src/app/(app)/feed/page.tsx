import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, count, eq, ne } from "drizzle-orm";
import { Search, Settings2 } from "lucide-react";
import { StoryCard } from "@/components/stories/story-card";
import { Alert, Badge, ButtonLink, Card, EmptyState, Input } from "@/components/ui";
import { db } from "@/db";
import { InviteColleaguesCard } from "@/components/invite-colleagues";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { user as userTable, userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { PAGE_SIZE, pageFrom } from "@/lib/pagination";
import { listSavedStories, listStories, savedStoryIds } from "@/lib/stories";
import { categoryLabel, industryLabel, vendorLabel } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { listAccessibleWorkspaces } from "@/lib/workspace";

export const metadata: Metadata = { title: "Your feed" };

const TABS = [
  { slug: "for-you", label: "For you" },
  { slug: "top", label: "Top this week" },
  { slug: "latest", label: "Everything" },
  { slug: "saved", label: "Saved" },
] as const;

export default async function FeedPage({ searchParams }: PageProps<"/feed">) {
  const user = await requireUser("/feed");
  if (!user.onboardedAt) redirect("/onboarding");
  const params = await searchParams;
  const tab = TABS.find((t) => t.slug === params.tab)?.slug ?? "for-you";
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = pageFrom(params);
  const offset = (page - 1) * PAGE_SIZE;

  const [[prefs], workspaces, [colleagues]] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1),
    listAccessibleWorkspaces(user),
    user.companyDomain
      ? db
          .select({ n: count() })
          .from(userTable)
          .where(and(eq(userTable.companyDomain, user.companyDomain), ne(userTable.id, user.id)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  const p = prefs ?? { categories: [], vendors: [], industries: [], minImportance: 2, digestFrequency: "weekly" as const };

  let stories =
    tab === "saved"
      ? await listSavedStories(user.id)
      : await listStories({
          ...(tab === "for-you" ? { categories: p.categories, vendors: p.vendors, industries: p.industries, matchAny: true, minImportance: p.minImportance, sinceDays: 30 } : {}),
          ...(tab === "top" ? { sinceDays: 7, order: "top" as const, minImportance: 3 } : {}),
          ...(tab === "latest" ? { sinceDays: 30 } : {}),
          search: q || undefined,
          limit: PAGE_SIZE + 1,
          offset,
        });
  const hasMore = tab !== "saved" && stories.length > PAGE_SIZE;
  stories = stories.slice(0, PAGE_SIZE);
  const saved = await savedStoryIds(user.id, stories.map((s) => s.id));
  const qs = (overrides: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { tab, q: q || undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && String(v) === "1")) sp.set(k, String(v));
    return `/feed?${sp.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {!user.emailVerified ? <VerifyEmailBanner email={user.email} /> : null}
      {params.welcome ? (
        <Alert tone="success" className="mb-6">
          <strong>Your radar is live.</strong> This feed is filtered to your interests.{" "}
          {p.digestFrequency !== "off" ? `You'll get your first ${p.digestFrequency} digest by email.` : ""}
        </Alert>
      ) : null}
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
              {TABS.map((t) => (
                <Link
                  key={t.slug}
                  href={qs({ tab: t.slug, page: 1 })}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium",
                    tab === t.slug ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            {tab !== "saved" ? (
              <form action="/feed" className="relative sm:w-64">
                <input type="hidden" name="tab" value={tab} />
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input name="q" defaultValue={q} placeholder="Search stories" className="pl-9" />
              </form>
            ) : null}
          </div>

          <div className="mt-6 space-y-4">
            {stories.length === 0 ? (
              <EmptyState
                title={tab === "saved" ? "No saved stories yet" : "No stories match yet"}
                description={
                  tab === "saved"
                    ? "Use the bookmark icon on any story to save it for later."
                    : q
                      ? "Try a different search."
                      : "Try widening your interests or lowering your signal threshold."
                }
                action={tab === "for-you" ? <ButtonLink href="/settings" variant="secondary">Edit interests</ButtonLink> : undefined}
              />
            ) : (
              stories.map((s) => <StoryCard key={s.id} story={s} showSave saved={saved.has(s.id)} />)
            )}
          </div>
          {page > 1 || hasMore ? (
            <div className="mt-6 flex justify-between">
              {page > 1 ? <ButtonLink variant="secondary" href={qs({ page: page - 1 })}>← Newer</ButtonLink> : <span />}
              {hasMore ? <ButtonLink variant="secondary" href={qs({ page: page + 1 })}>Older →</ButtonLink> : null}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Your interests</h2>
              <Link href="/settings" className="text-slate-400 hover:text-slate-700" aria-label="Edit interests">
                <Settings2 className="size-4" />
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.categories.map((c) => (
                <Badge key={c}>{categoryLabel(c)}</Badge>
              ))}
              {p.vendors.map((v) => (
                <Badge key={v} tone="radar">
                  {vendorLabel(v)}
                </Badge>
              ))}
              {p.industries.map((i) => (
                <Badge key={i} tone="blue">
                  {industryLabel(i)}
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Email digest: <span className="font-medium text-slate-700">{p.digestFrequency === "off" ? "off" : p.digestFrequency}</span>
            </p>
          </Card>
          {user.companyDomain ? (
            <InviteColleaguesCard domain={user.companyDomain} company={user.company ?? user.companyDomain} colleagues={colleagues?.n ?? 0} />
          ) : null}
          {workspaces.length === 0 ? (
            <div className="rounded-xl bg-ink-900 p-5 text-white">
              <h2 className="font-semibold">Track your own AI initiatives</h2>
              <p className="mt-1.5 text-sm text-slate-300">
                Bring every AI project, from Claude and ChatGPT to Copilot and in-house builds, into one prioritized portfolio,
                with measured impact and the data each one depends on.
              </p>
              <ButtonLink href="/contact?from=feed_workspace_cta" variant="accent" className="mt-4 w-full">
                Talk to North Labs
              </ButtonLink>
            </div>
          ) : (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-900">Your workspaces</h2>
              <ul className="mt-2 space-y-1">
                {workspaces.map((w) => (
                  <li key={w.id}>
                    <Link href={`/w/${w.slug}`} className="text-sm text-radar-700 hover:underline">
                      {w.name} →
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
