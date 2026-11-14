import { z } from "zod";
import { APPROACH_LABELS, BuildBriefSchema, type BuildBrief } from "@/lib/build/schema";
import { STAGES, labelFrom, vendorLabel } from "@/lib/taxonomy";

/**
 * Show prep: the rundown format, deterministic builders for each segment type, and the run sheet /
 * show notes renderers. Pure (no DB) so it can be unit tested; the loaders live in server.ts.
 */

export const SEGMENT_KINDS = ["news", "build_live", "data", "regulation", "custom"] as const;
export type SegmentKind = (typeof SEGMENT_KINDS)[number];
export const SEGMENT_LABELS: Record<SegmentKind, string> = {
  news: "News",
  build_live: "Build it live",
  data: "By the numbers",
  regulation: "Deadline watch",
  custom: "Segment",
};

export const SegmentSchema = z.object({
  id: z.string(),
  kind: z.enum(SEGMENT_KINDS),
  title: z.string(),
  minutes: z.number(),
  story_ids: z.array(z.string()),
  talking_points: z.array(z.string()),
  hot_take: z.string().nullable(),
  mid_market_angle: z.string().nullable(),
  audience_question: z.string().nullable(),
  notes: z.string().nullable(),
  /** For "build it live": the full brief, so the host has the details on hand. */
  brief: BuildBriefSchema.nullable().optional(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const RundownSchema = z.object({
  cold_open: z.string(),
  segments: z.array(SegmentSchema),
  closer: z.string(),
  generator: z.string(),
});
export type Rundown = z.infer<typeof RundownSchema>;

export function parseRundown(content: unknown): Rundown | null {
  const r = RundownSchema.safeParse(content);
  return r.success ? r.data : null;
}

/** Stories covered by the rundown's news segments, in order. */
export const storyIdsOf = (r: Rundown) => [...new Set(r.segments.filter((s) => s.kind === "news").flatMap((s) => s.story_ids))];

export const runtimeMinutes = (r: Rundown) => r.segments.reduce((n, s) => n + s.minutes, 0);

/* ─────────────────────────────── News prep ─────────────────────────────── */

export type PrepStory = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  whyItMatters: string | null;
  importance: number;
  vendors: string[];
  articleCount: number;
};

/** What the model writes (prose only). Structure, ids and timings are assembled deterministically. */
export const NewsPrepSchema = z.object({
  cold_open: z.string().describe("20–40 second opener teasing the biggest stories, in the host's voice"),
  stories: z.array(
    z.object({
      story_id: z.string(),
      hook: z.string().describe("Punchy on-air headline for the segment"),
      talking_points: z.array(z.string()).describe("3–5 points, plain language, facts only from the story"),
      hot_take: z.string().describe("A defensible opinion the host can argue"),
      mid_market_angle: z.string().describe("What a 200–2,000 person company should do or watch"),
      audience_question: z.string().describe("A question to put to viewers"),
    }),
  ),
  closer: z.string().describe("Sign-off with a call to action"),
});
export type NewsPrep = z.infer<typeof NewsPrepSchema>;

const firstSentences = (text: string, n = 2) => text.split(/(?<=[.!?])\s+/).slice(0, n).join(" ");

/** Fallback prep without a model: real facts from the stories plus prompts for the host to fill in. */
export function templateNewsPrep(stories: readonly PrepStory[]): NewsPrep {
  const lead = stories[0];
  return {
    cold_open: lead
      ? `Big one to start: ${lead.title}. Plus ${Math.max(stories.length - 1, 0)} more stories that matter if you're the one who has to make AI work at your company. Let's go.`
      : "Welcome in. Let's get into what happened in AI and what it means for your company.",
    stories: stories.map((s) => {
      const vendors = s.vendors.map(vendorLabel);
      return {
        story_id: s.id,
        hook: s.title,
        talking_points: [
          firstSentences(s.summary),
          ...(s.whyItMatters ? [s.whyItMatters] : []),
          ...(vendors.length ? [`Who's involved: ${vendors.join(", ")}`] : []),
          ...(s.articleCount > 1 ? [`${s.articleCount} outlets covering it`] : []),
        ],
        hot_take: "Your call: real change for a 500-person company this quarter, or noise?",
        mid_market_angle: s.whyItMatters ?? "What should an operator do about it this week?",
        audience_question: vendors.length ? `Are you using ${vendors[0]} today? Tell us how it's going.` : "Does this change anything at your company?",
      };
    }),
    closer: "That's the show. Get the daily radar free at the link below, and if you want help building any of this, North Labs is the easy button.",
  };
}

const newsMinutes = (importance: number) => (importance >= 4 ? 6 : importance === 3 ? 4 : 3);

/**
 * Build the rundown: news segments in story order, any segments kept from the previous rundown
 * (build-it-live, data, custom), and a deadline-watch segment at the end when there are deadlines.
 */
export function assembleRundown(opts: {
  prep: NewsPrep;
  stories: readonly PrepStory[];
  deadlines: readonly string[];
  generator: string;
  previous?: Rundown | null;
}): Rundown {
  const fallback = templateNewsPrep(opts.stories);
  const byId = new Map(opts.prep.stories.map((p) => [p.story_id, p]));
  const news: Segment[] = opts.stories.map((s, i) => {
    const p = byId.get(s.id) ?? fallback.stories[i];
    return {
      id: `news-${s.id}`,
      kind: "news",
      title: p.hook || s.title,
      minutes: newsMinutes(s.importance),
      story_ids: [s.id],
      talking_points: p.talking_points,
      hot_take: p.hot_take || null,
      mid_market_angle: p.mid_market_angle || null,
      audience_question: p.audience_question || null,
      notes: null,
    };
  });
  const kept = (opts.previous?.segments ?? []).filter((s) => s.kind !== "news" && s.kind !== "regulation");
  const regulation: Segment[] = opts.deadlines.length
    ? [
        {
          id: "regulation",
          kind: "regulation",
          title: "Deadline watch",
          minutes: 3,
          story_ids: [],
          talking_points: [...opts.deadlines],
          hot_take: null,
          mid_market_angle: "Put these dates on someone's calendar now; retirements and compliance dates don't move.",
          audience_question: null,
          notes: null,
        },
      ]
    : [];
  return {
    cold_open: opts.prep.cold_open || fallback.cold_open,
    segments: [...news, ...kept, ...regulation],
    closer: opts.prep.closer || fallback.closer,
    generator: opts.generator,
  };
}

/* ─────────────────────────────── Build it live ─────────────────────────────── */

export function buildLiveSegment(idea: { title: string; problem: string }, brief: BuildBrief, id: string): Segment {
  const rec = brief.options[brief.recommended_option];
  const lean = rec.approach === "configure" || rec.approach === "low_code";
  return {
    id,
    kind: "build_live",
    title: `Build it live: ${idea.title}`,
    minutes: 12,
    story_ids: [],
    talking_points: [
      `The ask: ${idea.problem}`,
      `Options on the table: ${brief.options.map((o) => `${o.name} (${APPROACH_LABELS[o.approach].toLowerCase()}, effort ${o.effort})`).join("; ")}`,
      `Recommendation: ${rec.name} on ${rec.platform}. ${rec.why}`,
      ...(brief.data_plan.length ? [`Data it needs: ${brief.data_plan.map((d) => `${d.data} from ${d.system}`).join("; ")}`] : []),
      `Guardrail that matters most: ${brief.ai_design.guardrails[0] ?? brief.ai_design.human_oversight}`,
      `How we'd know it works: ${brief.evaluation.success_metrics.slice(0, 2).join("; ")}`,
      `First three tickets: ${brief.tickets.slice(0, 3).map((t) => t.title).join(" → ")}`,
    ],
    hot_take: lean
      ? "You don't need a dev team for this. Most companies already own the tool that does it."
      : "This one deserves real engineering. Here's where the shortcuts would bite you.",
    mid_market_angle: rec.cost_notes,
    audience_question: "Would you build it this way? Tell us what you'd do differently.",
    notes: "Walk through the recommended option on screen, then show the draft prompt and the test cases.",
    brief,
  };
}

/* ─────────────────────────────── By the numbers ─────────────────────────────── */

/** Minimum opted-in workspaces before any aggregate is shown, and per platform. Keeps every number non-identifying. */
export const MIN_ORGS = 5;
export const MIN_ORGS_PER_PLATFORM = 3;

export type InsightOrg = {
  initiatives: { stage: string; platforms: string[]; riskTier: string; annualHours: number | null }[];
};

export type Insights =
  | { eligible: false; orgCount: number }
  | {
      eligible: true;
      orgCount: number;
      initiativeCount: number;
      perOrg: number;
      stageShare: { stage: string; pct: number }[];
      productionPct: number;
      classifiedPct: number;
      topPlatforms: { platform: string; orgPct: number }[];
      medianAnnualHours: number | null;
    };

/** Percentages rounded to the nearest 5 so small groups can't be reverse-engineered. */
const pct5 = (part: number, whole: number) => (whole ? Math.round(((part / whole) * 100) / 5) * 5 : 0);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function summarizeInsights(orgs: readonly InsightOrg[]): Insights {
  const active = orgs.filter((o) => o.initiatives.length > 0);
  if (active.length < MIN_ORGS) return { eligible: false, orgCount: active.length };
  const all = active.flatMap((o) => o.initiatives);
  const platformOrgs = new Map<string, number>();
  for (const o of active) for (const p of new Set(o.initiatives.flatMap((i) => i.platforms))) platformOrgs.set(p, (platformOrgs.get(p) ?? 0) + 1);
  const orgsWithHours = active.filter((o) => o.initiatives.some((i) => i.annualHours != null && i.annualHours > 0));
  const hours = all.map((i) => i.annualHours).filter((h): h is number => h != null && h > 0);
  const med = orgsWithHours.length >= MIN_ORGS ? median(hours) : null;
  return {
    eligible: true,
    orgCount: active.length,
    initiativeCount: all.length,
    perOrg: Math.round((all.length / active.length) * 10) / 10,
    stageShare: STAGES.filter((s) => s.slug !== "retired")
      .map((s) => ({ stage: s.label, pct: pct5(all.filter((i) => i.stage === s.slug).length, all.length) }))
      .filter((s) => s.pct > 0),
    productionPct: pct5(all.filter((i) => i.stage === "production").length, all.length),
    classifiedPct: pct5(all.filter((i) => i.riskTier !== "unclassified").length, all.length),
    topPlatforms: [...platformOrgs]
      .filter(([, n]) => n >= MIN_ORGS_PER_PLATFORM)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, n]) => ({ platform: vendorLabel(p), orgPct: pct5(n, active.length) })),
    medianAnnualHours: med == null ? null : med >= 100 ? Math.round(med / 50) * 50 : Math.round(med / 10) * 10,
  };
}

export function dataSegment(insights: Extract<Insights, { eligible: true }>, id: string): Segment {
  const top = [...insights.stageShare].sort((a, b) => b.pct - a.pct)[0];
  const early = (insights.stageShare.find((s) => s.stage === "Idea")?.pct ?? 0) + (insights.stageShare.find((s) => s.stage === "Evaluating")?.pct ?? 0);
  const angle =
    early >= 50
      ? `About ${early}% of initiatives are still ideas or being evaluated. The win isn't more ideas; it's getting one to a pilot this quarter.`
      : top
        ? `The biggest group is ${top.stage.toLowerCase()} (${top.pct}%). If that's where yours are, you're normal. Pick one and push it to the next stage.`
        : null;
  return {
    id,
    kind: "data",
    title: "By the numbers: what mid-market companies are actually building",
    minutes: 6,
    story_ids: [],
    talking_points: [
      `${insights.orgCount} companies, ${insights.initiativeCount} AI initiatives tracked: about ${insights.perOrg} per company.`,
      `Where they are: ${insights.stageShare.map((s) => `${s.stage} ${s.pct}%`).join(", ")}.`,
      ...(insights.topPlatforms.length
        ? [`Most-used platforms: ${insights.topPlatforms.map((p) => `${p.platform} (${p.orgPct}% of companies)`).join(", ")}.`]
        : []),
      `About ${insights.classifiedPct}% of initiatives have a risk tier assigned.`,
      ...(insights.medianAnnualHours != null ? [`Typical estimate: roughly ${insights.medianAnnualHours.toLocaleString("en-US")} hours saved a year per initiative.`] : []),
    ],
    hot_take:
      insights.productionPct < 30
        ? `Only about ${insights.productionPct}% make it to production. The bottleneck isn't the model; it's data access and ownership.`
        : `About ${insights.productionPct}% are in production. The mid-market is shipping faster than the headlines suggest.`,
    mid_market_angle: angle,
    audience_question: "How many AI initiatives does your company have in production? Be honest.",
    notes: "Aggregate of workspaces that opted in, rounded to the nearest 5%. Never name a company or an initiative, or quote one company's figures.",
  };
}

/* ─────────────────────────────── Custom ─────────────────────────────── */

export function customSegment(input: { title: string; minutes: number; points: string }, id: string): Segment {
  return {
    id,
    kind: "custom",
    title: input.title,
    minutes: input.minutes,
    story_ids: [],
    talking_points: input.points
      .split("\n")
      .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean),
    hot_take: null,
    mid_market_angle: null,
    audience_question: null,
    notes: null,
  };
}

/** Add a segment after the news, before the closing deadline watch. */
export function insertSegment(r: Rundown, seg: Segment): Rundown {
  const at = r.segments.findIndex((s) => s.kind === "regulation");
  const segments = [...r.segments];
  segments.splice(at < 0 ? segments.length : at, 0, seg);
  return { ...r, segments };
}

/** Move a segment up or down, or remove it. Unknown ids leave the rundown unchanged. */
export function editSegments(r: Rundown, segmentId: string, op: "up" | "down" | "remove"): Rundown {
  const i = r.segments.findIndex((s) => s.id === segmentId);
  if (i < 0) return r;
  const segments = [...r.segments];
  if (op === "remove") segments.splice(i, 1);
  else {
    const j = op === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= segments.length) return r;
    [segments[i], segments[j]] = [segments[j], segments[i]];
  }
  return { ...r, segments };
}

/* ─────────────────────────────── Run sheet & show notes ─────────────────────────────── */

type StoryRef = { title: string; slug: string };

export function rundownToMarkdown(
  meta: { number: number; title: string; airDate: string },
  r: Rundown,
  storiesById: ReadonlyMap<string, StoryRef>,
  baseUrl: string,
): string {
  const lines = [`# Episode ${meta.number}: ${meta.title}`, `_Air date ${meta.airDate} · about ${runtimeMinutes(r)} minutes_`, "", "## Cold open", r.cold_open, ""];
  r.segments.forEach((s, i) => {
    lines.push(`## ${i + 1}. ${SEGMENT_LABELS[s.kind]}: ${s.title} (${s.minutes} min)`);
    for (const id of s.story_ids) {
      const st = storiesById.get(id);
      if (st) lines.push(`Story: ${st.title} (${baseUrl}/radar/${st.slug})`);
    }
    lines.push(...s.talking_points.map((p) => `- ${p}`));
    if (s.hot_take) lines.push(`**Hot take:** ${s.hot_take}`);
    if (s.mid_market_angle) lines.push(`**Mid-market angle:** ${s.mid_market_angle}`);
    if (s.audience_question) lines.push(`**Ask the audience:** ${s.audience_question}`);
    if (s.notes) lines.push(`_Producer note: ${s.notes}_`);
    if (s.brief) {
      lines.push("", "<details><summary>Draft system prompt</summary>", "", "```", s.brief.ai_design.system_prompt, "```", "</details>");
    }
    lines.push("");
  });
  lines.push("## Closer", r.closer, "");
  return lines.join("\n");
}

/** A starting point for public show notes: one line per segment, story links, and the call to action. */
export function showNotesFromRundown(r: Rundown, storiesById: ReadonlyMap<string, StoryRef>, baseUrl: string): string {
  const items = r.segments.flatMap((s) => {
    if (s.kind === "news") {
      return s.story_ids.map((id) => storiesById.get(id)).filter((x): x is StoryRef => !!x).map((st) => `- ${st.title.replace(/[.!?:;,]+$/, "")}: ${baseUrl}/radar/${st.slug}`);
    }
    if (s.kind === "regulation") return [`- Deadline watch: ${s.talking_points.length} upcoming date${s.talking_points.length === 1 ? "" : "s"} to know`];
    return [`- ${s.kind === "custom" ? s.title : `${SEGMENT_LABELS[s.kind]}: ${s.title.replace(/^(Build it live|By the numbers):\s*/, "")}`}`];
  });
  return [
    firstSentences(r.cold_open, 1),
    "",
    "In this episode:",
    ...items,
    "",
    `Get the daily AI radar, free: ${baseUrl}/sign-up?src=show`,
    `How ready is your company for AI? Take the 3-minute assessment: ${baseUrl}/assessment?src=show`,
  ].join("\n");
}

/** YouTube video id from a watch, share, live, shorts or embed URL. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:embed|live|shorts)\/([^/?]+)/)?.[1] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Show notes → paragraphs and bullet lists, with URLs split out so the page can link them. */
export type NotesBlock = { type: "p"; parts: NotesPart[] } | { type: "ul"; items: NotesPart[][] };
export type NotesPart = { text: string } | { url: string };

const URL_RE = /(https?:\/\/[^\s)]+)/g;
const linkify = (line: string): NotesPart[] => line.split(URL_RE).filter(Boolean).map((t) => (/^https?:\/\//.test(t) ? { url: t } : { text: t }));

export function parseNotes(text: string): NotesBlock[] {
  const blocks: NotesBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === "ul") last.items.push(linkify(bullet[1]));
      else blocks.push({ type: "ul", items: [linkify(bullet[1])] });
    } else blocks.push({ type: "p", parts: linkify(line) });
  }
  return blocks;
}

export const stageLabel = (slug: string) => labelFrom(STAGES, slug);
