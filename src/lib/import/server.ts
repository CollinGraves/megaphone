import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { hasAnthropic } from "@/lib/env";
import { DEFAULT_MODEL } from "@/lib/ingest/llm";
import { STAGES, VENDORS } from "@/lib/taxonomy";
import { ImportResultSchema, MAX_IMPORT_CHARS, MAX_IMPORT_ITEMS, normalizeItem, readPastedList, titleKey, type ImportItem } from "./parse";

const SYSTEM_PROMPT = `You turn whatever a company pastes (a spreadsheet, meeting notes, an email, a messy list) into a list of AI projects for a portfolio tool.

Rules:
- One item per distinct AI project or idea. Merge duplicates. Skip lines that are not projects (headings, dates, greetings, totals).
- Use the user's own words for the title and problem. Keep titles short and specific.
- Never invent facts. If the text doesn't say something, leave it empty or null. Scores stay 3 unless the text gives a reason.
- platforms: only slugs from the allowed list, and only when the text names that vendor or one of its products (ChatGPT means openai, Copilot means microsoft, Claude means anthropic, Gemini means google).
- stage: idea, evaluating, building, pilot (testing or trial), production (live, in use) or retired. Use idea when unclear.
- hours_saved_per_month: only when the text states time spent or saved; convert weekly figures to monthly (x4.3). Otherwise null.
- Never use em dashes.`;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

async function readWithModel(text: string): Promise<{ items: ImportItem[]; generator: string }> {
  const model = process.env.AI_RADAR_BRIEF_MODEL || process.env.AI_RADAR_MODEL || DEFAULT_MODEL;
  const response = await getClient().beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ImportResultSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Allowed platform slugs: ${VENDORS.map((v) => `${v.slug} (${v.label})`).join(", ")}
Stages: ${STAGES.map((s) => s.slug).join(", ")}
Return at most ${MAX_IMPORT_ITEMS} items.

<pasted>
${text}
</pasted>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI couldn't read this list.");
  if (!response.parsed_output) throw new Error("The AI's answer couldn't be read.");
  const items = response.parsed_output.items.map((i) => normalizeItem(i)).filter((i): i is ImportItem => i !== null);
  return { items: items.slice(0, MAX_IMPORT_ITEMS), generator: response.model ?? model };
}

export type ProposedItem = ImportItem & { duplicateOf: string | null };

/**
 * Read pasted text into proposed projects: with AI when a key is set (falling back to the plain reader
 * if the call fails), and flag ones whose title matches an existing project.
 */
export async function proposeImport(text: string, existingTitles: string[]): Promise<{ items: ProposedItem[]; generator: string; fellBack: boolean }> {
  const input = text.slice(0, MAX_IMPORT_CHARS);
  let result: { items: ImportItem[]; generator: string };
  let fellBack = false;
  if (hasAnthropic()) {
    try {
      result = await readWithModel(input);
    } catch (err) {
      console.error("[import] model read failed, using the plain reader", err);
      result = { items: readPastedList(input), generator: "plain" };
      fellBack = true;
    }
  } else {
    result = { items: readPastedList(input), generator: "plain" };
  }
  const existing = new Map(existingTitles.map((t) => [titleKey(t), t]));
  const seen = new Set<string>();
  const items = result.items
    .filter((i) => {
      const k = titleKey(i.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((i) => ({ ...i, duplicateOf: existing.get(titleKey(i.title)) ?? null }));
  return { items, generator: result.generator, fellBack };
}
