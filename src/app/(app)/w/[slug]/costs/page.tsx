import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { Lock, Receipt, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, ButtonLink, Card, CardBody, CardHeader, Input, PageHeader, Select, Stat } from "@/components/ui";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { suggestMatch } from "@/lib/costs/match";
import { PROVIDERS, type ApiProviderId } from "@/lib/costs/providers";
import { loadCostSummary } from "@/lib/costs/summary";
import { FEATURE_LABELS, hasFeature } from "@/lib/plans";
import { timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { InlineForm } from "../_components/client";
import { connectProvider, disconnectProvider, saveCostMatch, syncNow } from "./actions";

export const metadata: Metadata = { title: "AI spend" };
// Connecting pulls 90 days of history from the vendor.
export const maxDuration = 60;

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n > 0 && n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const API_PROVIDERS: ApiProviderId[] = ["openai", "anthropic"];

export default async function CostsPage({ params }: PageProps<"/w/[slug]/costs">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;
  const header = (
    <PageHeader
      eyebrow="AI spend"
      title="What your AI costs"
      description="Connect your AI vendors' billing, read-only. Radar pulls the costs every night and ties them to your AI projects, so nobody has to type them in."
    />
  );

  if (!hasFeature(ctx.org.plan, "ai_spend")) {
    return (
      <>
        {header}
        <Card>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <Lock className="size-4 text-slate-400" /> {FEATURE_LABELS.ai_spend.name} comes with the Business plan
            </div>
            <p className="text-sm text-slate-600">{FEATURE_LABELS.ai_spend.description}</p>
            {ctx.can("billing:manage") ? (
              <ButtonLink href={`${base}/billing?upgrade=ai_spend`}>See plans</ButtonLink>
            ) : (
              <p className="text-sm text-slate-500">An owner or admin can upgrade in Plan &amp; billing.</p>
            )}
          </CardBody>
        </Card>
      </>
    );
  }

  const [summary, projects] = await Promise.all([
    loadCostSummary(ctx.org.id),
    db
      .select({ id: initiatives.id, title: initiatives.title })
      .from(initiatives)
      .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt)))
      .orderBy(initiatives.title),
  ]);
  const canManage = ctx.can("settings:manage");
  const canMatch = ctx.can("initiative:write");
  const titleOf = new Map(projects.map((p) => [p.id, p.title]));
  const hasData = summary.dimensions.length > 0;
  const projectRows = [...summary.byProject].sort((a, b) => b[1] - a[1]);

  return (
    <>
      {header}

      <Card className="mb-6">
        <CardHeader title="Connections" description="Read-only. Radar only reads costs and project names. Keys are encrypted and never shown again." />
        <ul className="divide-y divide-slate-100">
          {API_PROVIDERS.map((p) => {
            const info = PROVIDERS[p];
            const conn = summary.connections.find((c) => c.provider === p);
            return (
              <li key={p} className="px-5 py-4">
                {conn ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{info.name}</span>
                        <Badge tone={conn.status === "active" ? "radar" : "red"}>{conn.status === "active" ? "Connected" : "Needs attention"}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {conn.label} · key {conn.secretHint} · {conn.lastSyncedAt ? `synced ${timeAgo(conn.lastSyncedAt)}` : "not synced yet"}
                      </div>
                      {conn.lastError ? <div className="mt-1 text-xs text-red-700">{conn.lastError}</div> : null}
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <InlineForm action={syncNow}>
                          <input type="hidden" name="slug" value={ctx.org.slug} />
                          <input type="hidden" name="connectionId" value={conn.id} />
                          <SubmitButton variant="secondary" size="sm" pendingText="Syncing…">
                            <RefreshCw className="size-3.5" /> Sync now
                          </SubmitButton>
                        </InlineForm>
                        <InlineForm action={disconnectProvider}>
                          <input type="hidden" name="slug" value={ctx.org.slug} />
                          <input type="hidden" name="connectionId" value={conn.id} />
                          <ConfirmSubmit message={`Disconnect ${info.name}? Radar deletes the key and all ${info.name} spend data.`}>Disconnect</ConfirmSubmit>
                        </InlineForm>
                      </div>
                    ) : null}
                  </div>
                ) : canManage ? (
                  <ActionForm action={connectProvider} className="space-y-2">
                    <input type="hidden" name="slug" value={ctx.org.slug} />
                    <input type="hidden" name="provider" value={p} />
                    <label htmlFor={`key-${p}`} className="font-medium text-slate-900">
                      Connect {info.name}
                    </label>
                    <p className="text-xs text-slate-500">
                      {info.keyHelp}{" "}
                      <a href={info.keyHelpUrl} target="_blank" rel="noreferrer" className="text-radar-700 hover:underline">
                        Open {info.name} admin keys
                      </a>
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input id={`key-${p}`} name="key" type="password" autoComplete="off" placeholder={`${info.keyPrefix}…`} className="min-w-0 flex-1 font-mono" required />
                      <SubmitButton pendingText="Checking the key…">Connect</SubmitButton>
                    </div>
                  </ActionForm>
                ) : (
                  <div className="text-sm text-slate-500">
                    <span className="font-medium text-slate-900">{info.name}</span> isn&apos;t connected. An owner or admin can connect it.
                  </div>
                )}
              </li>
            );
          })}
          <li className="flex flex-wrap items-center gap-2 px-5 py-4 text-sm text-slate-500">
            <span className="font-medium text-slate-700">Microsoft 365 Copilot</span>
            <Badge>Coming soon</Badge>
            <span>Seats you pay for and how many people use them.</span>
          </li>
        </ul>
      </Card>

      {hasData ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="This month so far" value={usd(summary.totals.thisMonth)} />
            <Stat label="Last month" value={usd(summary.totals.lastMonth)} />
            <Stat label="Last 30 days" value={usd(summary.totals.last30)} />
            <Stat label="Not tied to a project" value={usd(summary.totals.unassigned30)} hint="Last 30 days" />
          </div>

          {projectRows.length ? (
            <Card className="mb-6">
              <CardHeader title="By AI project" description="Last 30 days, from the spend you've matched below." />
              <ul className="divide-y divide-slate-100">
                {projectRows.map(([id, amount]) => (
                  <li key={id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <Link href={`${base}/initiatives/${id}`} className="min-w-0 truncate font-medium text-slate-900 hover:text-radar-700">
                      {titleOf.get(id) ?? "Archived AI project"}
                    </Link>
                    <span className="shrink-0 tabular-nums text-slate-700">{usd(amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Match spend to AI projects"
              description="Each row is a project or workspace in your vendor's billing. Match it once and its costs count toward that AI project from then on."
            />
            <ul className="divide-y divide-slate-100">
              {summary.dimensions.map((d) => {
                const suggestion = !d.mapped ? suggestMatch(d.name, projects) : null;
                const current = d.ignored ? "ignore" : (d.initiativeId ?? suggestion?.id ?? "");
                return (
                  <li key={`${d.connectionId}:${d.dimensionKey}`} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{d.name}</span>
                        <Badge>{PROVIDERS[d.provider as ApiProviderId]?.name ?? d.provider}</Badge>
                        {d.mapped ? null : suggestion ? <Badge tone="amber">Suggested match</Badge> : <Badge tone="red">Not matched</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {usd(d.last30)} in the last 30 days · {usd(d.total90)} in 90 days
                      </div>
                    </div>
                    {canMatch ? (
                      <InlineForm action={saveCostMatch} className="sm:flex-nowrap">
                        <input type="hidden" name="slug" value={ctx.org.slug} />
                        <input type="hidden" name="connectionId" value={d.connectionId} />
                        <input type="hidden" name="dimensionKey" value={d.dimensionKey} />
                        <input type="hidden" name="dimensionName" value={d.name} />
                        <Select name="target" defaultValue={current} aria-label={`AI project for ${d.name}`} className="w-full sm:w-64">
                          <option value="">Not matched yet</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                          <option value="ignore">Not an AI project</option>
                        </Select>
                        <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                          {d.mapped ? "Save" : suggestion ? "Confirm" : "Save"}
                        </SubmitButton>
                      </InlineForm>
                    ) : (
                      <span className="text-sm text-slate-600">{d.ignored ? "Not an AI project" : d.initiativeId ? titleOf.get(d.initiativeId) : "Not matched yet"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      ) : summary.connections.length ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-slate-600">
            <Receipt className="size-5 text-slate-400" /> No spend in the last 90 days yet. New costs show up after the nightly sync.
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
