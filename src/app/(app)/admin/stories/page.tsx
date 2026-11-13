import type { Metadata } from "next";
import Link from "next/link";
import { and, arrayContains, count, desc, eq, gte, ilike, type SQL } from "drizzle-orm";
import { Eye, EyeOff, Newspaper, Star } from "lucide-react";
import { db } from "@/db";
import { stories } from "@/db/schema";
import { SubmitButton } from "@/components/forms";
import { Badge, Button, ButtonLink, Card, EmptyState, ImportanceMeter, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { CATEGORIES, CATEGORY_SLUGS, categoryLabel, vendorLabel } from "@/lib/taxonomy";
import { cn, timeAgo } from "@/lib/utils";
import { intParam, oneOf, param } from "../_lib/params";
import { AutoSubmitSelect } from "../_components/auto-submit-select";
import { Pager } from "../_components/pager";
import { setStoryFeatured, setStoryImportance, setStoryStatus } from "./actions";

export const metadata: Metadata = { title: "Stories" };

const PAGE_SIZE = 40;
const STATUS_FILTERS = ["published", "hidden", "featured"] as const;

export default async function StoriesPage({ searchParams }: PageProps<"/admin/stories">) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const status = oneOf(param(sp, "status"), STATUS_FILTERS);
  const category = oneOf(param(sp, "category"), CATEGORY_SLUGS);
  const minImportance = intParam(sp, "minImportance", { min: 1, max: 5 });
  const q = param(sp, "q")?.slice(0, 100);
  const page = intParam(sp, "page", { min: 1, max: 10_000 }) ?? 1;

  const where: SQL[] = [];
  if (status === "featured") where.push(eq(stories.featured, true));
  else if (status) where.push(eq(stories.status, status));
  if (category) where.push(arrayContains(stories.categories, [category]));
  if (minImportance) where.push(gte(stories.importance, minImportance));
  if (q) where.push(ilike(stories.title, `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`));
  const condition = where.length ? and(...where) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(stories)
      .where(condition)
      .orderBy(desc(stories.publishedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(stories).where(condition),
  ]);
  const view = { status, category, minImportance, q };
  const hasFilters = Boolean(status || category || minImportance || q);

  return (
    <>
      <PageHeader
        eyebrow="Radar"
        title="Stories"
        description="Curate the public Radar: hide noise, feature the stories that matter and correct importance."
      />

      <Card className="mb-4">
        <form method="get" className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_repeat(3,1fr)_auto]">
          <Input name="q" type="search" placeholder="Search titles…" defaultValue={q} aria-label="Search" />
          <Select name="status" defaultValue={status ?? ""} aria-label="Status">
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="hidden">Hidden</option>
            <option value="featured">Featured</option>
          </Select>
          <Select name="category" defaultValue={category ?? ""} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select name="minImportance" defaultValue={minImportance?.toString() ?? ""} aria-label="Minimum importance">
            <option value="">Any importance</option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                Importance ≥ {n}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              Filter
            </Button>
            {hasFilters ? (
              <ButtonLink href="/admin/stories" variant="ghost">
                Reset
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </Card>

      {rows.length === 0 ? (
        <EmptyState icon={<Newspaper className="size-6" />} title="No stories match" description={hasFilters ? "Try widening your filters." : undefined} />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Story</Th>
                <Th className="hidden md:table-cell">Published</Th>
                <Th>Importance</Th>
                <Th className="relative">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const hidden = s.status === "hidden";
                return (
                  <tr key={s.id} className={cn(hidden && "bg-slate-50/70")}>
                    <Td className="max-w-xl">
                      <div className="flex items-start gap-2">
                        {s.featured ? <Star className="mt-0.5 size-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Featured" /> : null}
                        <Link
                          href={`/radar/${s.slug}`}
                          className={cn("font-medium hover:text-radar-700 hover:underline", hidden ? "text-slate-500 line-through" : "text-slate-900")}
                        >
                          {s.title}
                        </Link>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                        {hidden ? <Badge tone="red">Hidden</Badge> : null}
                        {s.categories.map((c) => (
                          <Badge key={c} tone="blue">
                            {categoryLabel(c)}
                          </Badge>
                        ))}
                        {s.vendors.slice(0, 3).map((v) => (
                          <Badge key={v} tone="violet">
                            {vendorLabel(v)}
                          </Badge>
                        ))}
                        <span className="ml-1">
                          {s.primarySourceName ?? "Unknown source"}
                          {s.articleCount > 1 ? ` + ${s.articleCount - 1} more` : ""} · {s.classifiedBy}
                        </span>
                      </div>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-slate-500 md:table-cell" title={s.publishedAt.toISOString()}>
                      {timeAgo(s.publishedAt)}
                    </Td>
                    <Td>
                      <form action={setStoryImportance} className="relative flex items-center gap-2">
                        <input type="hidden" name="id" value={s.id} />
                        <ImportanceMeter value={s.importance} />
                        <AutoSubmitSelect key={s.importance} name="importance" defaultValue={String(s.importance)} aria-label={`Importance for ${s.title}`} className="h-8 w-16">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </AutoSubmitSelect>
                      </form>
                    </Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <form action={setStoryFeatured}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="featured" value={s.featured ? "0" : "1"} />
                          <SubmitButton size="sm" variant="ghost" pendingText="…">
                            <Star className={cn("size-4", s.featured && "fill-amber-400 text-amber-500")} aria-hidden />
                            {s.featured ? "Unfeature" : "Feature"}
                          </SubmitButton>
                        </form>
                        <form action={setStoryStatus}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="status" value={hidden ? "published" : "hidden"} />
                          <SubmitButton size="sm" variant="ghost" pendingText="…">
                            {hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
                            {hidden ? "Unhide" : "Hide"}
                          </SubmitButton>
                        </form>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pager basePath="/admin/stories" params={view} page={page} pageSize={PAGE_SIZE} total={total} />
        </Card>
      )}
    </>
  );
}
