import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CATEGORIES, CATEGORY_SLUGS, INDUSTRY_SLUGS, VENDORS, VENDOR_SLUGS } from "@/lib/taxonomy";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type ArticleInput = {
  id: string;
  source: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date;
};

export type CandidateStory = { id: string; title: string; summary: string };

const ClassificationSchema = z.object({
  articles: z.array(
    z.object({
      article_id: z.string(),
      relevant: z.boolean().describe("False if the article is not meaningfully about AI, or is spam/ads/job posts."),
      assignment: z
        .string()
        .describe("Either the id of an EXISTING story this article covers, or a new_stories group_key."),
    }),
  ),
  new_stories: z.array(
    z.object({
      group_key: z.string(),
      title: z.string().describe("Neutral, specific headline, max ~90 chars. No clickbait."),
      summary: z.string().describe("2–3 plain sentences on what happened."),
      why_it_matters: z.string().describe("1–2 sentences on implications for companies adopting AI."),
      categories: z.array(z.enum(CATEGORY_SLUGS as [string, ...string[]])),
      vendors: z.array(z.enum(VENDOR_SLUGS as [string, ...string[]])),
      industries: z.array(z.enum(INDUSTRY_SLUGS as [string, ...string[]])),
      importance: z.number().int().min(1).max(5),
    }),
  ),
});

export type ClassificationResult = z.infer<typeof ClassificationSchema>;

const SYSTEM_PROMPT = `You are the news editor for AI Radar, a briefing service that helps business and technology leaders keep up with AI.

You receive a batch of newly fetched articles and a list of stories already published in the last few days. For every article:
1. Decide whether it is relevant: it must be substantively about AI (models, products, research, policy, companies, infrastructure, adoption). Drop marketing fluff, job posts, podcasts without content, and unrelated tech news.
2. Deduplicate: if the article covers the same underlying event as an existing story, assign it to that story's id. Different outlets covering the same announcement are the SAME story. Follow-ups that add genuinely new facts (e.g. a price change announced days after a launch) are NEW stories.
3. Otherwise, group it with other new articles about the same event under a short group_key (e.g. "g1"), and describe each new group once in new_stories.

Every article must appear exactly once in "articles", including irrelevant ones (give them assignment "none"). Every group_key you use must appear exactly once in new_stories.

Categories: ${CATEGORIES.map((c) => `${c.slug} (${c.description})`).join("; ")}.
Vendors: only tag a vendor when the story is materially about that company or its products. Allowed: ${VENDORS.map((v) => v.slug).join(", ")}.
Industries: only when the story is specifically about AI in that industry; otherwise leave empty.

Importance (be stingy, most stories are 2–3):
5 = major event every AI leader must know today (frontier model launch, major regulation passed, top-vendor price/deprecation change affecting many customers)
4 = significant development worth reading this week
3 = notable, relevant to people following that area
2 = minor or niche
1 = trivia

Write titles and summaries in a neutral, factual voice. Do not invent facts beyond what the articles say.`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export async function classifyBatch(
  batch: ArticleInput[],
  candidates: CandidateStory[],
): Promise<ClassificationResult> {
  const articlesBlock = batch
    .map(
      (a) =>
        `<article id="${a.id}" source="${escapeAttr(a.source)}" published="${a.publishedAt.toISOString()}">\n<title>${a.title}</title>\n${a.excerpt ? `<excerpt>${a.excerpt}</excerpt>\n` : ""}</article>`,
    )
    .join("\n");
  const storiesBlock = candidates.length
    ? candidates.map((s) => `<story id="${s.id}"><title>${s.title}</title><summary>${s.summary}</summary></story>`).join("\n")
    : "(none)";

  const response = await getClient().beta.messages.parse({
    model: process.env.AI_RADAR_MODEL || DEFAULT_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ClassificationSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `<existing_stories>\n${storiesBlock}\n</existing_stories>\n\n<new_articles>\n${articlesBlock}\n</new_articles>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Model declined classification batch (${response.stop_details?.category ?? "unknown"})`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Classification output was truncated (max_tokens)");
  }
  if (!response.parsed_output) throw new Error("Classification output could not be parsed");
  return response.parsed_output;
}

const escapeAttr = (s: string) => s.replace(/"/g, "&quot;");
