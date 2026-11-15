import { z } from "zod";
import { STAGES, VENDORS } from "@/lib/taxonomy";

/**
 * Paste-your-list import: turn a spreadsheet, notes or a messy list into proposed AI projects.
 * Pure module: the model's output format, a no-AI fallback reader and the clean-up both share.
 */

export const MAX_IMPORT_ITEMS = 50;
export const MAX_IMPORT_CHARS = 20_000;

const STAGE_SLUGS = STAGES.map((s) => s.slug) as [string, ...string[]];

/** What the model returns for each project (no numeric bounds: clean-up clamps them). */
export const ImportItemSchema = z.object({
  title: z.string().describe("Short name for the AI project, under 80 characters"),
  problem: z.string().describe("The problem or task it addresses, in the user's words. Empty if unknown."),
  solution: z.string().describe("How AI would help, if the text says. Empty if unknown."),
  business_unit: z.string().nullable().describe("Team or department named in the text, else null"),
  owner: z.string().nullable().describe("Person named as owner or lead, else null"),
  platforms: z.array(z.string()).describe("Vendor slugs from the allowed list that the text mentions"),
  stage: z.enum(STAGE_SLUGS).describe("Best guess from the text; 'idea' when unclear"),
  value_score: z.number().describe("1-5 business value; 3 unless the text gives evidence"),
  feasibility_score: z.number().describe("1-5 how easy to build; 3 unless the text gives evidence"),
  hours_saved_per_month: z.number().nullable().describe("Only if the text states or clearly implies time saved; else null"),
});
export const ImportResultSchema = z.object({ items: z.array(ImportItemSchema) });

export type ImportItem = {
  title: string;
  problem: string;
  solution: string;
  businessUnit: string | null;
  owner: string | null;
  platforms: string[];
  stage: (typeof STAGES)[number]["slug"];
  valueScore: number;
  feasibilityScore: number;
  hoursSavedPerMonth: number | null;
};

const VENDOR_SLUGS = new Set<string>(VENDORS.map((v) => v.slug));

/** Words people use for a vendor's products → vendor slug (only vendors the app knows). */
const PLATFORM_ALIASES: [RegExp, string][] = (
  [
    [/\b(chat ?gpt|gpt-?\d\w*|o\d(?:-mini)?|openai|custom gpts?|dall-?e|whisper)\b/i, "openai"],
    [/\b(copilot|microsoft|azure|power automate|m365|office 365|teams)\b/i, "microsoft"],
    [/\b(claude|anthropic)\b/i, "anthropic"],
    [/\b(gemini|google|vertex|bard|workspace ai)\b/i, "google"],
    [/\b(aws|amazon|bedrock|q business)\b/i, "amazon"],
    [/\b(llama|meta ai)\b/i, "meta"],
    [/\b(mistral)\b/i, "mistral"],
    [/\b(grok|xai)\b/i, "xai"],
    [/\b(nvidia)\b/i, "nvidia"],
    [/\b(salesforce|einstein|agentforce)\b/i, "salesforce"],
    [/\b(servicenow)\b/i, "servicenow"],
    [/\b(databricks)\b/i, "databricks"],
    [/\b(hugging ?face)\b/i, "huggingface"],
  ] as [RegExp, string][]
).filter(([, slug]) => VENDOR_SLUGS.has(slug));

export function platformsIn(text: string): string[] {
  return [...new Set(PLATFORM_ALIASES.filter(([re]) => re.test(text)).map(([, slug]) => slug))];
}

const STAGE_WORDS: [RegExp, ImportItem["stage"]][] = [
  [/\b(retired|sunset|stopped|killed|cancell?ed)\b/i, "retired"],
  [/\b(production|live|launched|rolled out|in use|deployed)\b/i, "production"],
  [/\b(pilot|testing|trial|beta|poc|proof of concept)\b/i, "pilot"],
  [/\b(building|in progress|development|developing|wip)\b/i, "building"],
  [/\b(evaluat\w*|explor\w*|research\w*|scoping|investigat\w*)\b/i, "evaluating"],
  [/\b(idea|backlog|proposed|someday|wishlist)\b/i, "idea"],
];

export function stageFrom(text: string | null | undefined): ImportItem["stage"] {
  if (!text) return "idea";
  for (const [re, stage] of STAGE_WORDS) if (re.test(text)) return stage;
  return "idea";
}

const clampScore = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 3);
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const cleanOrNull = (s: unknown, max: number) => clean(s, max) || null;

/** Clean any proposed item (from the model or the fallback reader) into something safe to save. */
export function normalizeItem(raw: Partial<z.infer<typeof ImportItemSchema>>): ImportItem | null {
  const title = clean(raw.title, 160);
  if (title.length < 3) return null;
  const hours = typeof raw.hours_saved_per_month === "number" && raw.hours_saved_per_month > 0 ? Math.min(Math.round(raw.hours_saved_per_month), 100_000) : null;
  return {
    title,
    problem: clean(raw.problem, 5000),
    solution: clean(raw.solution, 5000),
    businessUnit: cleanOrNull(raw.business_unit, 100),
    owner: cleanOrNull(raw.owner, 120),
    platforms: [...new Set((raw.platforms ?? []).map((p) => String(p).toLowerCase()).filter((p) => VENDOR_SLUGS.has(p)))],
    stage: (STAGE_SLUGS as string[]).includes(raw.stage ?? "") ? (raw.stage as ImportItem["stage"]) : "idea",
    valueScore: clampScore(raw.value_score),
    feasibilityScore: clampScore(raw.feasibility_score),
    hoursSavedPerMonth: hours,
  };
}

/* ─────────────────────────────── Fallback reader (no AI) ─────────────────────────────── */

/** Minimal CSV/TSV row parser (quotes, escaped quotes, commas inside quotes). */
function splitRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const COLUMN_HINTS: Record<keyof Pick<ImportItem, "title" | "problem" | "solution" | "businessUnit" | "owner"> | "platform" | "stage" | "hours", RegExp> = {
  title: /^(title|name|project|initiative|idea|use ?case)s?$/i,
  problem: /^(problem|description|details?|summary|why|pain|notes?)$/i,
  solution: /^(solution|approach|how|proposal|plan)$/i,
  businessUnit: /^(team|department|dept|business ?unit|bu|function|group)$/i,
  owner: /^(owner|lead|sponsor|champion|contact)$/i,
  platform: /^(platforms?|tools?|vendors?|technology|tech|model|ai tool)$/i,
  stage: /^(stage|status|phase|state)$/i,
  hours: /^(hours?( saved)?( \/ ?month| per month)?|time saved)$/i,
};

function readTable(lines: string[]): ImportItem[] | null {
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
  if (!sep) return null;
  const header = splitRow(lines[0], sep);
  const col = (key: keyof typeof COLUMN_HINTS) => header.findIndex((h) => COLUMN_HINTS[key].test(h));
  const titleCol = col("title");
  if (titleCol < 0) return null;
  const idx = { problem: col("problem"), solution: col("solution"), bu: col("businessUnit"), owner: col("owner"), platform: col("platform"), stage: col("stage"), hours: col("hours") };
  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "") : "");
  const items: ImportItem[] = [];
  for (const line of lines.slice(1)) {
    const row = splitRow(line, sep);
    const text = row.join(" ");
    const hours = Number(get(row, idx.hours).replace(/[^\d.]/g, ""));
    const item = normalizeItem({
      title: get(row, titleCol),
      problem: get(row, idx.problem),
      solution: get(row, idx.solution),
      business_unit: get(row, idx.bu) || null,
      owner: get(row, idx.owner) || null,
      platforms: platformsIn(idx.platform >= 0 ? get(row, idx.platform) : text),
      stage: stageFrom(get(row, idx.stage) || null),
      hours_saved_per_month: hours > 0 ? hours : null,
    });
    if (item) items.push(item);
  }
  return items;
}

const BULLET = /^\s*(?:[-*•▪◦]|\d{1,3}[.)]|\[[ x]\])\s+/i;

function readList(lines: string[]): ImportItem[] {
  const groups: { head: string; body: string[] }[] = [];
  for (const line of lines) {
    // Indented lines (including sub-bullets) are details of the item above.
    const indented = /^(\s{2,}|\t)/.test(line) && groups.length > 0;
    const text = line.replace(BULLET, "").trim();
    if (!text) continue;
    if (indented && groups.length) groups[groups.length - 1].body.push(text);
    else groups.push({ head: text, body: [] });
  }
  return groups
    .map(({ head, body }) => {
      // "Title: details" or "Title - details" puts the details in the problem.
      const m = head.match(/^(.{3,80}?)\s*(?::|\s[-–]\s)\s*(.+)$/);
      const title = m ? m[1] : head;
      const problem = [m ? m[2] : "", ...body].filter(Boolean).join(" ");
      const all = `${head} ${body.join(" ")}`;
      return normalizeItem({ title, problem, solution: "", platforms: platformsIn(all), stage: stageFrom(all) });
    })
    .filter((i): i is ImportItem => i !== null);
}

/** Read a pasted list without AI: a table with a header row, or one project per line/bullet. */
export function readPastedList(text: string): ImportItem[] {
  const lines = text
    .slice(0, MAX_IMPORT_CHARS)
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : null;
  if (lines.length > 1 && sep) {
    // A table with a header row, possibly followed by loose notes or bullets that aren't table rows.
    const rows = lines.filter((l, i) => i === 0 || (l.includes(sep) && !BULLET.test(l)));
    const table = readTable(rows);
    if (table) {
      const loose = lines.filter((l, i) => i > 0 && !(l.includes(sep) && !BULLET.test(l)));
      return [...table, ...(loose.length ? readList(loose) : [])].slice(0, MAX_IMPORT_ITEMS);
    }
  }
  return readList(lines).slice(0, MAX_IMPORT_ITEMS);
}

/** Lowercased, punctuation-free title for duplicate checks. */
export const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
