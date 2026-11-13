import type { Metadata } from "next";
import { count, desc, sql } from "drizzle-orm";
import { ExternalLink, Plus } from "lucide-react";
import { db } from "@/db";
import { articles, ingestionRuns, sources } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Checkbox, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { CATEGORIES, categoryLabel, VENDORS, vendorLabel } from "@/lib/taxonomy";
import { cn, formatNumber, timeAgo } from "@/lib/utils";
import { AutoSubmitSelect } from "../_components/auto-submit-select";
import { daysAgo } from "../_lib/time";
import { createSource, fetchSourceNow, runFullPipeline, setSourceActive, setSourceAuthority } from "./actions";
import { RunButton, StatsSummary } from "./run-button";

export const metadata: Metadata = { title: "Sources" };
// "Fetch now" / "Run full pipeline" run inline in the server action.
export const maxDuration = 300;

export default async function SourcesPage() {
  await requirePlatformAdmin();
  const weekAgo = daysAgo(7);

  const [rows, articleCounts, runs] = await Promise.all([
    db.select().from(sources),
    db
      .select({
        sourceId: articles.sourceId,
        total: count(),
        last7: sql<number>`count(*) filter (where ${articles.publishedAt} >= ${weekAgo.toISOString()}::timestamptz)`.mapWith(Number),
      })
      .from(articles)
      .groupBy(articles.sourceId),
    db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(15),
  ]);

  const countsBySource = new Map(articleCounts.map((c) => [c.sourceId, c]));
  // Active before paused; within each, failing sources first, then alphabetical.
  const list = [...rows].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      Number(b.consecutiveFailures > 0) - Number(a.consecutiveFailures > 0) ||
      a.name.localeCompare(b.name),
  );
  const active = rows.filter((s) => s.active);
  const failing = active.filter((s) => s.consecutiveFailures > 0);
  const lastRun = runs[0];

  return (
    <>
      <PageHeader
        eyebrow="Ingestion"
        title="News sources"
        description={`${active.length} active of ${rows.length} sources · ${failing.length} failing${lastRun ? ` · last run ${timeAgo(lastRun.startedAt)}` : ""}`}
        actions={
          <RunButton action={runFullPipeline} label="Run full pipeline" pendingLabel="Running pipeline…" variant="accent" />
        }
      />

      <Card className="mb-6">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-semibold text-slate-900">
            <Plus className="size-4 transition-transform group-open:rotate-45" aria-hidden /> Add a source
          </summary>
          <CardBody className="border-t border-slate-100">
            <ActionForm action={createSource} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Name" htmlFor="src-name">
                  <Input id="src-name" name="name" required maxLength={120} placeholder="OpenAI News" />
                </Field>
                <Field label="Feed URL" htmlFor="src-feed" hint="RSS/Atom feed or sitemap.xml">
                  <Input id="src-feed" name="feedUrl" type="url" required placeholder="https://example.com/feed.xml" />
                </Field>
                <Field label="Homepage" htmlFor="src-home">
                  <Input id="src-home" name="homepageUrl" type="url" placeholder="https://example.com" />
                </Field>
                <Field label="Type" htmlFor="src-type">
                  <Select id="src-type" name="type" defaultValue="rss">
                    <option value="rss">RSS / Atom</option>
                    <option value="sitemap">Sitemap</option>
                  </Select>
                </Field>
                <Field label="Path filter" htmlFor="src-path" hint="Sitemaps only: keep URLs containing this path">
                  <Input id="src-path" name="pathFilter" placeholder="/news/" maxLength={200} />
                </Field>
                <Field label="Vendor" htmlFor="src-vendor" hint="Set for first-party sources">
                  <Select id="src-vendor" name="vendor" defaultValue="">
                    <option value="">None</option>
                    {VENDORS.map((v) => (
                      <option key={v.slug} value={v.slug}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default category" htmlFor="src-cat">
                  <Select id="src-cat" name="defaultCategory" defaultValue="">
                    <option value="">None</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Authority" htmlFor="src-auth" hint="5 = canonical / first-party">
                  <Select id="src-auth" name="authority" defaultValue="3">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Max items per fetch" htmlFor="src-max">
                  <Input id="src-max" name="maxItemsPerFetch" type="number" min={1} max={200} defaultValue={25} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <Checkbox name="aiOnly" defaultChecked /> AI-focused feed (otherwise items are filtered by AI keywords)
              </label>
              <SubmitButton pendingText="Adding…">Add source</SubmitButton>
            </ActionForm>
          </CardBody>
        </details>
      </Card>

      <Card className="mb-6">
        <Table>
          <thead>
            <tr>
              <Th>Source</Th>
              <Th>Health</Th>
              <Th className="text-right">Articles 7d</Th>
              <Th>Authority</Th>
              <Th>Active</Th>
              <Th className="relative">
                <span className="sr-only">Fetch</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const c = countsBySource.get(s.id);
              return (
                <tr key={s.id} className={cn(!s.active && "bg-slate-50/60 text-slate-500")}>
                  <Td className="max-w-72">
                    <div className="flex items-center gap-1.5 font-medium text-slate-900">
                      {s.name}
                      {s.homepageUrl ? (
                        <a href={s.homepageUrl} target="_blank" rel="noreferrer" className="relative text-slate-400 hover:text-slate-700" title="Homepage">
                          <ExternalLink className="size-3.5" aria-hidden />
                          <span className="sr-only">Homepage</span>
                        </a>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-slate-500" title={s.feedUrl}>
                      {s.feedUrl}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge>{s.type}</Badge>
                      {s.vendor ? <Badge tone="violet">{vendorLabel(s.vendor)}</Badge> : null}
                      {s.defaultCategory ? <Badge tone="blue">{categoryLabel(s.defaultCategory)}</Badge> : null}
                      {!s.aiOnly ? <Badge tone="amber">keyword-filtered</Badge> : null}
                      {s.pathFilter ? <Badge>path: {s.pathFilter}</Badge> : null}
                    </div>
                  </Td>
                  <Td className="max-w-72 text-xs">
                    {s.consecutiveFailures > 0 ? (
                      <Badge tone="red">
                        {s.consecutiveFailures} failure{s.consecutiveFailures === 1 ? "" : "s"} in a row
                      </Badge>
                    ) : s.lastSuccessAt ? (
                      <Badge tone="radar">Healthy</Badge>
                    ) : (
                      <Badge>Never fetched</Badge>
                    )}
                    <div className="mt-1 text-slate-500">
                      {s.lastSuccessAt ? `Last success ${timeAgo(s.lastSuccessAt)}` : "No successful fetch yet"}
                    </div>
                    {s.lastError && s.consecutiveFailures > 0 ? (
                      <div className="mt-0.5 line-clamp-2 text-red-700" title={s.lastError}>
                        {s.lastError}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {formatNumber(c?.last7 ?? 0)}
                    <div className="text-xs text-slate-400">{formatNumber(c?.total ?? 0)} total</div>
                  </Td>
                  <Td>
                    <form action={setSourceAuthority} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={s.id} />
                      <AutoSubmitSelect key={s.authority} name="authority" defaultValue={String(s.authority)} aria-label={`Authority for ${s.name}`} className="h-8 w-16">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                    </form>
                  </Td>
                  <Td>
                    <form action={setSourceActive}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                      <SubmitButton size="sm" variant={s.active ? "secondary" : "ghost"} pendingText="…">
                        {s.active ? "Active" : "Paused"}
                      </SubmitButton>
                    </form>
                  </Td>
                  <Td className="text-right">
                    <RunButton action={fetchSourceNow.bind(null, s.id)} label="Fetch now" pendingLabel="Fetching…" compact />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Recent ingestion runs" description="Cron, manual and script runs, newest first" />
        {runs.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-500">No runs yet.</p>
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Trigger</Th>
                <Th>Duration</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap" title={r.startedAt.toISOString()}>
                    {timeAgo(r.startedAt)}
                  </Td>
                  <Td>
                    <Badge tone={r.trigger === "manual" ? "violet" : r.trigger === "cron" ? "blue" : "neutral"}>{r.trigger}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {r.finishedAt ? `${((r.finishedAt.getTime() - r.startedAt.getTime()) / 1000).toFixed(1)}s` : <Badge tone="amber">running</Badge>}
                  </Td>
                  <Td className="text-xs">
                    {r.error ? <div className="mb-1 text-red-700">Error: {r.error}</div> : null}
                    {r.stats ? <StatsSummary stats={r.stats} /> : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
