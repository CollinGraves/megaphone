import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { ChevronLeft, Download, FileText, Hammer, Loader2, Sparkles, Star, TriangleAlert } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, ButtonLink, buttonClass, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Textarea } from "@/components/ui";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { APPROACH_LABELS, EFFORT_LABELS, parseBrief, type BuildBrief } from "@/lib/build/schema";
import { briefQuota, listBriefs, listBuildUpdates } from "@/lib/build/server";
import { hasAnthropic } from "@/lib/env";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { CopyButton } from "../../../_components/client";
import { addBuildUpdate, generateBrief } from "./actions";
import { AutoRefresh } from "./auto-refresh";

// Brief generation runs after the action responds; give the function room to finish.
export const maxDuration = 300;

export async function generateMetadata({ params }: PageProps<"/w/[slug]/initiatives/[id]/build">): Promise<Metadata> {
  const { slug, id } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const [i] = await db.select({ title: initiatives.title }).from(initiatives).where(and(eq(initiatives.id, id), eq(initiatives.orgId, ctx.org.id))).limit(1);
  if (!i) notFound();
  return { title: `Build plan · ${i.title}` };
}

const STATUS_TONE = { planned: "neutral", in_progress: "blue", blocked: "red", done: "radar" } as const;
const STATUS_LABEL = { planned: "Planned", in_progress: "In progress", blocked: "Blocked", done: "Done" } as const;

export default async function BuildPage({ params, searchParams }: PageProps<"/w/[slug]/initiatives/[id]/build">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  const [initiative] = await db.select().from(initiatives).where(and(eq(initiatives.id, id), eq(initiatives.orgId, ctx.org.id))).limit(1);
  if (!initiative) notFound();

  const [versions, updates, quota] = await Promise.all([listBriefs(initiative.id), listBuildUpdates(initiative.id), briefQuota(ctx.org)]);
  const requested = Number(sp.v);
  const selected = versions.find((v) => v.brief.version === requested) ?? versions.find((v) => v.brief.status === "ready") ?? versions[0];
  const generating = versions.some((v) => v.brief.status === "generating");
  const brief = selected?.brief.status === "ready" ? parseBrief(selected.brief.content) : null;
  const canEdit = ctx.can("initiative:write");
  const base = `/w/${ctx.org.slug}/initiatives/${initiative.id}`;

  return (
    <div className="space-y-6">
      <AutoRefresh active={generating} />
      <Link href={base} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="size-4" /> {initiative.title}
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-radar-700">Build plan</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">From idea to something working</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            A build brief tailored to {ctx.org.name}&apos;s stack, data and risk tier: options compared, a recommended path, a ready-to-use
            prompt, test cases and developer tickets. Hand it to your team, a coding agent, or North Labs.
          </p>
        </div>
        {brief ? (
          <div className="flex flex-wrap gap-2">
            <a href={`${base}/build/markdown`} className={buttonClass("secondary", "sm")}>
              <FileText className="size-4" /> Markdown
            </a>
            <a href={`${base}/build/tickets`} className={buttonClass("secondary", "sm")}>
              <Download className="size-4" /> Jira CSV
            </a>
            <ButtonLink href={`/contact?from=build_brief&workspace=${ctx.org.slug}&story=${initiative.id}`} size="sm">
              <Hammer className="size-4" /> Have North Labs build it
            </ButtonLink>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {generating ? (
            <Alert className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Writing the build brief… this page updates automatically.
            </Alert>
          ) : null}
          {selected?.brief.status === "failed" ? (
            <Alert tone="error">
              Version {selected.brief.version} failed: {selected.brief.error ?? "unknown error"}
            </Alert>
          ) : null}
          {brief && selected ? (
            <BriefView brief={brief} version={selected.brief.version} generator={selected.brief.generator} createdAt={selected.brief.createdAt} author={selected.author} />
          ) : !generating ? (
            <EmptyState
              icon={<Sparkles className="size-6" />}
              title="No build brief yet"
              description={
                canEdit
                  ? "Generate one to see how to build this on the tools you already have, what data it needs, how to test it and the tickets to get started."
                  : "An editor can generate a build brief for this initiative."
              }
            />
          ) : null}
        </div>

        <aside className="space-y-6">
          {canEdit ? (
            <Card>
              <CardHeader
                title={versions.length ? "Regenerate" : "Generate brief"}
                description={quota.limit == null ? "Unlimited on your plan" : `${quota.remaining} of ${quota.limit} left this month`}
              />
              <CardBody>
                <ActionForm action={generateBrief} className="space-y-3">
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="initiativeId" value={initiative.id} />
                  <Field label="Guidance (optional)" htmlFor="guidance" hint="Constraints or preferences, e.g. “must run inside Teams”.">
                    <Textarea id="guidance" name="guidance" rows={3} maxLength={1000} />
                  </Field>
                  <SubmitButton className="w-full" pendingText="Starting…">
                    <Sparkles className="size-4" /> {versions.length ? "Generate a new version" : "Generate build brief"}
                  </SubmitButton>
                  {!hasAnthropic() ? (
                    <p className="text-xs text-amber-700">No AI key configured: you&apos;ll get a structured template brief instead of a tailored one.</p>
                  ) : null}
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {versions.length > 1 ? (
            <Card>
              <CardHeader title="Versions" />
              <ul className="divide-y divide-slate-100">
                {versions.map((v) => (
                  <li key={v.brief.id}>
                    <Link
                      href={`${base}/build?v=${v.brief.version}`}
                      className={cn("flex items-center justify-between px-5 py-2.5 text-sm hover:bg-slate-50", v.brief.id === selected?.brief.id && "bg-slate-50 font-medium")}
                    >
                      <span>
                        v{v.brief.version} · {timeAgo(v.brief.createdAt)}
                      </span>
                      <Badge tone={v.brief.status === "ready" ? "radar" : v.brief.status === "failed" ? "red" : "blue"}>{v.brief.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Build progress" description="Posted by your team, or by coding agents over MCP." />
            <CardBody className="space-y-4">
              {updates.length ? (
                <ol className="space-y-3">
                  {updates.map(({ update: u, author }) => (
                    <li key={u.id} className="text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={STATUS_TONE[u.status]}>{STATUS_LABEL[u.status]}</Badge>
                        {u.source === "mcp" ? <Badge tone="violet">via MCP</Badge> : null}
                        <span className="text-xs text-slate-500">
                          {author ?? "Someone"} · {timeAgo(u.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-700">{u.message}</p>
                      {u.link ? (
                        <a href={u.link} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-radar-700 hover:underline">
                          {u.link}
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-500">No updates yet.</p>
              )}
              {canEdit ? (
                <ActionForm action={addBuildUpdate} className="space-y-2 border-t border-slate-100 pt-4" resetOnSuccess>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="initiativeId" value={initiative.id} />
                  <Select name="status" defaultValue="in_progress" aria-label="Status">
                    <option value="planned">Planned</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </Select>
                  <Textarea name="message" rows={2} placeholder="What changed?" required minLength={3} />
                  <Input name="link" type="url" placeholder="Link (PR, ticket, demo) — optional" />
                  <SubmitButton variant="secondary" size="sm" className="w-full">
                    Post update
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </CardBody>
          </Card>

          <Card className="p-5 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Build it with a coding agent</div>
            <p className="mt-1">
              With a workspace API key, Claude Code or Cursor can fetch this brief with <code className="text-xs">workspace_get_build_spec</code> and
              report back with <code className="text-xs">workspace_report_progress</code>.
            </p>
            <Link href="/settings#api" className="mt-2 inline-block text-radar-700 hover:underline">
              Set up an API key →
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function List({ items }: { items: readonly string[] }) {
  if (!items.length) return <p className="text-sm text-slate-500">None.</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function BriefView({ brief: b, version, generator, createdAt, author }: { brief: BuildBrief; version: number; generator: string | null; createdAt: Date; author: string | null }) {
  const rec = b.options[b.recommended_option];
  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone="dark">v{version}</Badge>
            <span>
              {generator === "template" ? "Template brief" : `Generated by ${generator ?? "AI"}`} · {author ?? "Someone"} · {formatDate(createdAt)}
            </span>
          </div>
          <p className="text-[15px] leading-relaxed text-slate-800">{b.summary}</p>
        </CardBody>
      </Card>

      <Card className="border-radar-300">
        <CardHeader title={<span className="flex items-center gap-2"><Star className="size-4 text-radar-600" /> Recommended: {rec.name}</span>} description={`${rec.platform} · ${APPROACH_LABELS[rec.approach]} · ${EFFORT_LABELS[rec.effort]}`} />
        <CardBody className="space-y-3">
          <p className="text-sm text-slate-700">{rec.why}</p>
          <div className="flex flex-wrap gap-1.5">
            {rec.components.map((c) => (
              <Badge key={c}>{c}</Badge>
            ))}
          </div>
        </CardBody>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Options compared</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {b.options.map((o, i) => (
            <Card key={i} className={cn("p-4", i === b.recommended_option && "ring-2 ring-radar-400")}>
              <div className="text-xs text-slate-500">{APPROACH_LABELS[o.approach]}</div>
              <div className="mt-0.5 font-semibold text-slate-900">{o.name}</div>
              <div className="text-xs text-slate-500">
                {o.platform} · effort {o.effort}
              </div>
              <div className="mt-3 text-xs font-medium text-radar-800">Pros</div>
              <List items={o.pros} />
              <div className="mt-2 text-xs font-medium text-red-700">Cons</div>
              <List items={o.cons} />
              <p className="mt-2 text-xs text-slate-500">{o.cost_notes}</p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Requirements" />
          <CardBody className="space-y-3">
            <div className="text-xs font-medium text-slate-500">Functional</div>
            <List items={b.requirements.functional} />
            <div className="text-xs font-medium text-slate-500">Non-functional</div>
            <List items={b.requirements.non_functional} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Workflow" />
          <CardBody>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {b.workflow.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      {b.data_plan.length ? (
        <Card>
          <CardHeader title="Data plan" />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2">System</th>
                  <th className="px-5 py-2">Data</th>
                  <th className="px-5 py-2">Access</th>
                  <th className="px-5 py-2">Handling</th>
                </tr>
              </thead>
              <tbody>
                {b.data_plan.map((d, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="px-5 py-2 font-medium text-slate-900">{d.system}</td>
                    <td className="px-5 py-2">{d.data}</td>
                    <td className="px-5 py-2">{d.access}</td>
                    <td className="px-5 py-2">{d.handling}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="AI design" description="Ready to paste into your tool of choice." action={<CopyButton value={b.ai_design.system_prompt} label="Copy prompt" />} />
        <CardBody className="space-y-4">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-900 p-4 text-xs leading-relaxed text-slate-100">{b.ai_design.system_prompt}</pre>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Knowledge sources</div>
              <List items={b.ai_design.knowledge_sources} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Integrations</div>
              <List items={b.ai_design.integrations} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Guardrails</div>
              <List items={b.ai_design.guardrails} />
            </div>
          </div>
          <p className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">Human oversight: </span>
            {b.ai_design.human_oversight}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Evaluation" description="How you'll know it works before rolling it out." />
        <CardBody className="space-y-4">
          <List items={b.evaluation.success_metrics} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Scenario</th>
                  <th className="py-2 pr-4">Input</th>
                  <th className="py-2">Expected</th>
                </tr>
              </thead>
              <tbody>
                {b.evaluation.test_cases.map((t, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-4 font-medium text-slate-900">{t.scenario}</td>
                    <td className="py-2 pr-4">{t.input}</td>
                    <td className="py-2">{t.expected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs font-medium text-slate-500">Acceptance criteria</div>
          <List items={b.evaluation.acceptance_criteria} />
        </CardBody>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Risks" />
          <CardBody className="space-y-2">
            {b.risks.map((r, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <span className="font-medium text-slate-900">{r.risk}</span> <span className="text-slate-600">— {r.mitigation}</span>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Rollout" />
          <CardBody className="space-y-2">
            {b.rollout.map((r, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-slate-900">{r.phase}</span> <span className="text-slate-500">({r.duration})</span>
                <div className="text-slate-600">{r.goal}</div>
              </div>
            ))}
            {b.open_questions.length ? (
              <>
                <div className="pt-2 text-xs font-medium text-slate-500">Open questions</div>
                <List items={b.open_questions} />
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={`Work items (${b.tickets.length})`} description="In build order for the recommended option. Export them as a Jira CSV." />
        <ol className="divide-y divide-slate-100">
          {b.tickets.map((t, i) => (
            <li key={i} className="px-5 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400">{i + 1}</span>
                <span className="font-medium text-slate-900">{t.title}</span>
                <Badge>{t.estimate}</Badge>
              </div>
              <p className="mt-1 text-slate-600">{t.description}</p>
              <p className="mt-1 text-xs text-slate-500">Done when: {t.acceptance.join("; ")}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
