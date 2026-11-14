import { describe, expect, it } from "vitest";
import { templateBrief } from "@/lib/build/template";
import type { BriefContext } from "@/lib/build/context";
import {
  assembleRundown,
  buildLiveSegment,
  customSegment,
  dataSegment,
  editSegments,
  insertSegment,
  MIN_ORGS,
  parseNotes,
  parseRundown,
  rundownToMarkdown,
  runtimeMinutes,
  showNotesFromRundown,
  storyIdsOf,
  summarizeInsights,
  templateNewsPrep,
  youtubeId,
  type InsightOrg,
  type PrepStory,
} from "./rundown";

const story = (id: string, importance = 3, extra: Partial<PrepStory> = {}): PrepStory => ({
  id,
  slug: `story-${id}`,
  title: `Story ${id}`,
  summary: `Something happened with ${id}. More detail. Even more detail.`,
  whyItMatters: `It matters because of ${id}.`,
  importance,
  vendors: ["openai"],
  articleCount: 3,
  ...extra,
});

const stories = [story("a", 5, { title: "Story a" }), story("b", 3), story("c", 2, { title: "Story c." })];
const base = () => assembleRundown({ prep: templateNewsPrep(stories), stories, deadlines: ["GPT-4o retires on Dec 1, 2026"], generator: "template" });

const briefCtx: BriefContext = {
  org: { name: "a viewer's company", industry: null, defaultHourlyRate: 75 },
  initiative: {
    title: "Quote follow-up",
    problem: "Sales forgets to follow up on quotes.",
    solution: "",
    businessUnit: "Sales",
    stage: "idea",
    platforms: [],
    models: [],
    buildApproach: null,
    riskTier: "limited",
    customerFacing: false,
    affectsIndividuals: null,
    humanOversight: null,
    targetDate: null,
  },
  metrics: [],
  dependencies: [],
  portfolioPlatforms: ["Microsoft 365"],
  systems: [],
  stack: [],
  guidance: null,
};

describe("assembleRundown", () => {
  it("builds news segments in story order, timed by importance, with deadline watch last", () => {
    const r = base();
    expect(r.segments.map((s) => s.id)).toEqual(["news-a", "news-b", "news-c", "regulation"]);
    expect(r.segments.map((s) => s.minutes)).toEqual([6, 4, 3, 3]);
    expect(runtimeMinutes(r)).toBe(16);
    expect(storyIdsOf(r)).toEqual(["a", "b", "c"]);
    expect(parseRundown(r)).not.toBeNull();
  });

  it("falls back to template prep for stories the model skipped", () => {
    const prep = templateNewsPrep(stories);
    prep.stories = [{ ...prep.stories[1], hook: "Model hook for B" }];
    const r = assembleRundown({ prep, stories, deadlines: [], generator: "model" });
    expect(r.segments.map((s) => s.title)).toEqual(["Story a", "Model hook for B", "Story c."]);
  });

  it("keeps added segments when the news is regenerated, and drops the old news", () => {
    const withCustom = insertSegment(base(), customSegment({ title: "Mailbag", minutes: 5, points: "- Q1\n- Q2" }, "custom-1"));
    expect(withCustom.segments.map((s) => s.id)).toEqual(["news-a", "news-b", "news-c", "custom-1", "regulation"]);
    const fresh = [story("d", 4)];
    const r = assembleRundown({ prep: templateNewsPrep(fresh), stories: fresh, deadlines: [], generator: "template", previous: withCustom });
    expect(r.segments.map((s) => s.id)).toEqual(["news-d", "custom-1"]);
    expect(r.segments[1].talking_points).toEqual(["Q1", "Q2"]);
  });
});

describe("editSegments", () => {
  it("moves and removes, ignoring impossible moves and unknown ids", () => {
    const r = base();
    expect(editSegments(r, "news-b", "up").segments[0].id).toBe("news-b");
    expect(editSegments(r, "news-a", "up")).toBe(r);
    expect(editSegments(r, "regulation", "down")).toBe(r);
    expect(editSegments(r, "nope", "remove")).toBe(r);
    const removed = editSegments(r, "news-a", "remove");
    expect(storyIdsOf(removed)).toEqual(["b", "c"]);
  });
});

describe("buildLiveSegment", () => {
  it("summarizes the brief and keeps it for the host", () => {
    const brief = templateBrief(briefCtx);
    const seg = buildLiveSegment({ title: "Quote follow-up", problem: "Sales forgets to follow up on quotes." }, brief, "build-1");
    expect(seg.kind).toBe("build_live");
    expect(seg.talking_points[0]).toBe("The ask: Sales forgets to follow up on quotes.");
    expect(seg.talking_points.join(" ")).toContain(`Recommendation: ${brief.options[brief.recommended_option].name}`);
    expect(seg.brief).toBe(brief);
    expect(seg.hot_take).toMatch(/don't need a dev team/);
  });
});

describe("summarizeInsights", () => {
  const org = (n: number, platforms: string[], stage = "pilot", hours: number | null = 500): InsightOrg => ({
    initiatives: Array.from({ length: n }, () => ({ stage, platforms, riskTier: "limited", annualHours: hours })),
  });

  it("refuses to summarize fewer than the minimum number of companies", () => {
    const r = summarizeInsights(Array.from({ length: MIN_ORGS - 1 }, () => org(3, ["microsoft"])));
    expect(r).toEqual({ eligible: false, orgCount: MIN_ORGS - 1 });
    // Workspaces with no initiatives don't count toward the minimum.
    expect(summarizeInsights([...Array.from({ length: MIN_ORGS - 1 }, () => org(2, ["microsoft"])), org(0, [])]).eligible).toBe(false);
  });

  it("rounds to 5% and hides platforms used by too few companies", () => {
    const orgs = [org(2, ["microsoft", "openai"]), org(2, ["microsoft", "openai"]), org(2, ["microsoft", "openai"]), org(2, ["microsoft", "anthropic"]), org(1, ["microsoft"], "production")];
    const r = summarizeInsights(orgs);
    if (!r.eligible) throw new Error("expected eligible");
    expect(r.orgCount).toBe(5);
    expect(r.initiativeCount).toBe(9);
    expect(r.perOrg).toBe(1.8);
    expect(r.productionPct).toBe(10); // 1/9 = 11% → 10
    expect(r.topPlatforms.map((p) => p.platform)).toEqual(["Microsoft", "OpenAI"]); // Anthropic: 1 company, hidden
    expect(r.topPlatforms[0].orgPct).toBe(100);
    expect(r.medianAnnualHours).toBe(500);
    const seg = dataSegment(r, "data-1");
    expect(seg.talking_points[0]).toContain("5 companies, 9 AI initiatives");
    expect(seg.hot_take).toMatch(/Only about 10%/);
    expect(seg.mid_market_angle).toMatch(/biggest group is pilot \(90%\)/);
  });

  it("omits the hours median unless enough companies report hours", () => {
    const orgs = [org(1, [], "pilot", 1000), ...Array.from({ length: 4 }, () => org(1, [], "pilot", null))];
    const r = summarizeInsights(orgs);
    expect(r.eligible && r.medianAnnualHours).toBeNull();
  });
});

describe("run sheet and show notes", () => {
  const byId = new Map(stories.map((s) => [s.id, { title: s.title, slug: s.slug }]));

  it("renders a Markdown run sheet", () => {
    const md = rundownToMarkdown({ number: 3, title: "The big one", airDate: "2026-11-16" }, base(), byId, "https://radar.test");
    expect(md).toContain("# Episode 3: The big one");
    expect(md).toContain("about 16 minutes");
    expect(md).toContain("## 1. News: Story a (6 min)");
    expect(md).toContain("Story: Story a (https://radar.test/radar/story-a)");
    expect(md).toContain("**Hot take:**");
    expect(md).toContain("## 4. Deadline watch: Deadline watch (3 min)");
  });

  it("drafts show notes with story links and calls to action", () => {
    const notes = showNotesFromRundown(insertSegment(base(), customSegment({ title: "Mailbag", minutes: 5, points: "x" }, "c")), byId, "https://radar.test");
    expect(notes).toContain("- Story a: https://radar.test/radar/story-a");
    expect(notes).toContain("- Story c: https://radar.test/radar/story-c");
    expect(notes).toContain("- Mailbag");
    expect(notes).toContain("- Deadline watch: 1 upcoming date to know");
    expect(notes).toContain("https://radar.test/sign-up?src=show");
  });

  it("parses notes into paragraphs, lists and links", () => {
    const blocks = parseNotes("Intro line.\n\n- One: https://a.test/x\n- Two\nOutro https://b.test.");
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual({ type: "ul", items: [[{ text: "One: " }, { url: "https://a.test/x" }], [{ text: "Two" }]] });
    expect(blocks[2]).toEqual({ type: "p", parts: [{ text: "Outro " }, { url: "https://b.test." }] });
  });
});

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://vimeo.com/123", null],
    ["https://youtube.com/watch?v=bad", null],
    ["not a url", null],
  ])("%s", (url, id) => expect(youtubeId(url)).toBe(id));
});
