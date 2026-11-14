import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowDown, ArrowUp, ChevronLeft, Download, ExternalLink, Flame, Loader2, MessageCircleQuestion, Target, Trash2 } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { appUrl, hasAnthropic } from "@/lib/env";
import { parseRundown, rundownToMarkdown, runtimeMinutes, SEGMENT_LABELS, type Segment } from "@/lib/show/rundown";
import { episodeStories } from "@/lib/show/server";
import { formatDate } from "@/lib/utils";
import { CopyButton } from "../../_components/copy-button";
import {
  addBuildLiveAction,
  addCustomSegmentAction,
  addDataSegmentAction,
  deleteEpisodeAction,
  draftShowNotesAction,
  editSegmentAction,
  refreshNewsAction,
  saveEpisodeAction,
  setPublishedAction,
} from "../actions";

// "Build it live" writes a full build brief inside the action.
export const maxDuration = 300;

async function load(id: string) {
  const [ep] = await db.select().from(episodes).where(eq(episodes.id, id)).limit(1);
  return ep ?? null;
}

export async function generateMetadata({ params }: PageProps<"/admin/show/[id]">): Promise<Metadata> {
  const ep = await load((await params).id);
  return { title: ep ? `${ep.title} · Show` : "Show" };
}

const KIND_TONE = { news: "blue", build_live: "violet", data: "radar", regulation: "amber", custom: "neutral" } as const;

export default async function EpisodePrepPage({ params }: PageProps<"/admin/show/[id]">) {
  await requireStaff();
  const ep = await load((await params).id);
  if (!ep) notFound();
  const rundown = parseRundown(ep.rundown);
  const list = await episodeStories(ep);
  const storiesById = new Map(list.map((s) => [s.id, s]));
  const generating = ep.prepStatus === "generating";
  const base = appUrl();
  const runSheet = rundown ? rundownToMarkdown(ep, rundown, storiesById, base) : "";
  const hidden = <input type="hidden" name="id" value={ep.id} />;

  return (
    <div className="space-y-6">
      <AutoRefresh active={generating} />
      <Link href="/admin/show" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="size-4" /> All episodes
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-radar-700">
            Episode {ep.number} · {formatDate(ep.airDate, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            <Badge tone={ep.status === "published" ? "radar" : "neutral"}>{ep.status === "published" ? "Published" : "Draft"}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{ep.title}</h1>
          {rundown ? (
            <p className="mt-1 text-sm text-slate-600">
              {rundown.segments.length} segments · about {runtimeMinutes(rundown)} minutes ·{" "}
              {rundown.generator === "template" ? "template prep (add an Anthropic key for AI-written prep)" : `prep by ${rundown.generator}`}
            </p>
          ) : null}
        </div>
        {rundown ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton value={runSheet} label="Copy run sheet" />
            <a href={`/admin/show/${ep.id}/run-sheet`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download className="size-4" /> Markdown
            </a>
            {ep.status === "published" ? (
              <a href={`/show/${ep.slug}`} target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <ExternalLink className="size-4" /> Public page
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          {generating ? (
            <Alert className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Writing the rundown… this page updates automatically.
            </Alert>
          ) : null}
          {ep.prepStatus === "failed" ? <Alert tone="error">Prep failed: {ep.prepError ?? "unknown error"}. Refresh the news to try again.</Alert> : null}

          {rundown ? (
            <>
              <Card className="border-ink-800 bg-ink-950 p-5 text-slate-100">
                <div className="text-xs font-semibold uppercase tracking-wide text-radar-400">Cold open</div>
                <p className="mt-1 text-[15px] leading-relaxed">{rundown.cold_open}</p>
              </Card>
              <ol className="space-y-4">
                {rundown.segments.map((s, i) => (
                  <li key={s.id}>
                    <SegmentCard
                      segment={s}
                      index={i}
                      last={i === rundown.segments.length - 1}
                      episodeId={ep.id}
                      stories={s.story_ids.map((id) => storiesById.get(id)).filter((x) => !!x)}
                      locked={generating}
                    />
                  </li>
                ))}
              </ol>
              <Card className="border-ink-800 bg-ink-950 p-5 text-slate-100">
                <div className="text-xs font-semibold uppercase tracking-wide text-radar-400">Closer</div>
                <p className="mt-1 text-[15px] leading-relaxed">{rundown.closer}</p>
              </Card>
            </>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title="Episode page" description={ep.status === "published" ? `Live at /show/${ep.slug}` : "Publish when the video is up."} />
            <CardBody className="space-y-4">
              <ActionForm action={saveEpisodeAction}>
                {hidden}
                <Field label="Title" htmlFor="title">
                  <Input id="title" name="title" required minLength={3} maxLength={200} defaultValue={ep.title} />
                </Field>
                <Field label="Air date" htmlFor="ep-air">
                  <Input id="ep-air" name="airDate" type="date" required defaultValue={ep.airDate} />
                </Field>
                <Field label="Video URL" htmlFor="videoUrl" hint="YouTube links are embedded on the episode page.">
                  <Input id="videoUrl" name="videoUrl" type="url" placeholder="https://youtube.com/watch?v=…" defaultValue={ep.videoUrl ?? ""} />
                </Field>
                <Field label="Show notes" htmlFor="showNotes" hint="Plain text. Lines starting with “- ” become bullets; links are clickable.">
                  <Textarea id="showNotes" name="showNotes" rows={8} maxLength={10000} defaultValue={ep.showNotes ?? ""} key={ep.showNotes ?? ""} />
                </Field>
                <SubmitButton size="sm" className="w-full">
                  Save
                </SubmitButton>
              </ActionForm>
              <ActionForm action={draftShowNotesAction}>
                {hidden}
                <SubmitButton size="sm" variant="secondary" className="w-full" pendingText="Drafting…">
                  {ep.showNotes ? "Redraft show notes from rundown" : "Draft show notes from rundown"}
                </SubmitButton>
              </ActionForm>
              <ActionForm action={setPublishedAction}>
                {hidden}
                <input type="hidden" name="publish" value={ep.status === "published" ? "0" : "1"} />
                <SubmitButton size="sm" variant={ep.status === "published" ? "secondary" : "accent"} className="w-full" pendingText="Saving…">
                  {ep.status === "published" ? "Unpublish" : "Publish episode page"}
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Build it live" description="Turn a viewer's idea into a build brief on air." />
            <CardBody>
              <ActionForm action={addBuildLiveAction} resetOnSuccess>
                {hidden}
                <Field label="Idea" htmlFor="bl-title">
                  <Input id="bl-title" name="title" required minLength={3} maxLength={120} placeholder="Quote follow-up assistant" />
                </Field>
                <Field label="The problem, in their words" htmlFor="bl-problem">
                  <Textarea id="bl-problem" name="problem" rows={3} required minLength={10} maxLength={1500} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Team" htmlFor="bl-team">
                    <Input id="bl-team" name="team" maxLength={80} placeholder="Sales" />
                  </Field>
                  <Field label="Risk" htmlFor="bl-risk">
                    <Select id="bl-risk" name="riskTier" defaultValue="limited">
                      <option value="minimal">Minimal</option>
                      <option value="limited">Limited</option>
                      <option value="high">High</option>
                      <option value="unclassified">Unknown</option>
                    </Select>
                  </Field>
                </div>
                <Field label="Tools they already use" htmlFor="bl-stack" hint="Comma separated, e.g. Microsoft 365, ChatGPT">
                  <Input id="bl-stack" name="stack" maxLength={500} />
                </Field>
                <Field label="Systems involved" htmlFor="bl-systems" hint="Comma separated, e.g. HubSpot, Outlook">
                  <Input id="bl-systems" name="systems" maxLength={500} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <Checkbox name="customerFacing" /> Customer-facing
                </label>
                <SubmitButton size="sm" className="w-full" pendingText={hasAnthropic() ? "Writing the brief (up to a minute)…" : "Adding…"}>
                  Add build-it-live segment
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="More segments" />
            <CardBody className="space-y-5">
              <ActionForm action={addDataSegmentAction}>
                {hidden}
                <p className="text-sm text-slate-600">What opted-in mid-market companies are building, as rounded aggregates (needs 5+ workspaces).</p>
                <SubmitButton size="sm" variant="secondary" className="w-full" pendingText="Crunching…">
                  Add by-the-numbers segment
                </SubmitButton>
              </ActionForm>
              <ActionForm action={addCustomSegmentAction} resetOnSuccess className="space-y-3 border-t border-slate-100 pt-5">
                {hidden}
                <div className="grid grid-cols-[1fr_80px] gap-3">
                  <Field label="Custom segment" htmlFor="cs-title">
                    <Input id="cs-title" name="title" required minLength={3} maxLength={160} placeholder="Mailbag" />
                  </Field>
                  <Field label="Min" htmlFor="cs-min">
                    <Input id="cs-min" name="minutes" type="number" min={1} max={60} defaultValue={5} required />
                  </Field>
                </div>
                <Textarea name="points" rows={3} required maxLength={4000} placeholder="One talking point per line" aria-label="Talking points" />
                <SubmitButton size="sm" variant="secondary" className="w-full">
                  Add segment
                </SubmitButton>
              </ActionForm>
              <ActionForm action={refreshNewsAction} className="space-y-3 border-t border-slate-100 pt-5">
                {hidden}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="News window (days)" htmlFor="rn-days">
                    <Input id="rn-days" name="sinceDays" type="number" min={1} max={14} defaultValue={3} required />
                  </Field>
                  <Field label="Stories" htmlFor="rn-count">
                    <Input id="rn-count" name="count" type="number" min={1} max={10} defaultValue={Math.max(ep.storyIds.length, 1)} required />
                  </Field>
                </div>
                <SubmitButton size="sm" variant="secondary" className="w-full" pendingText="Refreshing…">
                  Re-pick news & rewrite
                </SubmitButton>
                <p className="text-xs text-slate-500">Replaces the news and deadline segments; your other segments stay.</p>
              </ActionForm>
            </CardBody>
          </Card>

          {ep.status === "draft" ? (
            <ActionForm action={deleteEpisodeAction}>
              {hidden}
              <SubmitButton size="sm" variant="ghost" className="w-full text-red-700" pendingText="Deleting…">
                <Trash2 className="size-4" /> Delete draft
              </SubmitButton>
            </ActionForm>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function SegmentCard({
  segment: s,
  index,
  last,
  episodeId,
  stories,
  locked,
}: {
  segment: Segment;
  index: number;
  last: boolean;
  episodeId: string;
  stories: { slug: string; title: string; primaryUrl: string }[];
  locked: boolean;
}) {
  const control = (op: "up" | "down" | "remove", label: string, icon: React.ReactNode, disabled = false) => (
    <form action={editSegmentAction}>
      <input type="hidden" name="id" value={episodeId} />
      <input type="hidden" name="segmentId" value={s.id} />
      <input type="hidden" name="op" value={op} />
      <Button type="submit" variant="ghost" size="sm" aria-label={label} title={label} disabled={disabled || locked}>
        {icon}
      </Button>
    </form>
  );
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold tabular-nums text-slate-400">{index + 1}</span>
            <Badge tone={KIND_TONE[s.kind]}>{SEGMENT_LABELS[s.kind]}</Badge>
            <span>{s.minutes} min</span>
          </div>
          <h2 className="mt-1 font-semibold text-slate-900">{s.title}</h2>
          {stories.map((st) => (
            <div key={st.slug} className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
              <Link href={`/radar/${st.slug}`} target="_blank" className="text-radar-700 hover:underline">
                {st.title}
              </Link>
              <a href={st.primaryUrl} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline">
                original source
              </a>
            </div>
          ))}
        </div>
        <div className="flex shrink-0">
          {control("up", "Move up", <ArrowUp className="size-4" />, index === 0)}
          {control("down", "Move down", <ArrowDown className="size-4" />, last)}
          {control("remove", "Remove segment", <Trash2 className="size-4" />)}
        </div>
      </div>
      <CardBody className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          {s.talking_points.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        {s.hot_take ? (
          <p className="flex gap-2 rounded-lg bg-orange-50 p-2.5 text-orange-900">
            <Flame className="mt-0.5 size-4 shrink-0" /> <span>{s.hot_take}</span>
          </p>
        ) : null}
        {s.mid_market_angle ? (
          <p className="flex gap-2 text-slate-700">
            <Target className="mt-0.5 size-4 shrink-0 text-radar-600" /> <span>{s.mid_market_angle}</span>
          </p>
        ) : null}
        {s.audience_question ? (
          <p className="flex gap-2 text-slate-700">
            <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-blue-600" /> <span>{s.audience_question}</span>
          </p>
        ) : null}
        {s.notes ? <p className="text-xs italic text-slate-500">Producer note: {s.notes}</p> : null}
        {s.brief ? (
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">Draft system prompt & test cases</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-ink-900 p-3 text-xs text-slate-100">{s.brief.ai_design.system_prompt}</pre>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {s.brief.evaluation.test_cases.map((t, i) => (
                <li key={i}>
                  <span className="font-medium text-slate-800">{t.scenario}:</span> {t.input} → {t.expected}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
