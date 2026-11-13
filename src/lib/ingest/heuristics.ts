import type { CategorySlug, IndustrySlug, VendorSlug } from "@/lib/taxonomy";

/**
 * Keyword-based classifier. Used when no ANTHROPIC_API_KEY is configured and as a
 * safety net when the model call fails. Deliberately conservative.
 */

const VENDOR_PATTERNS: Record<VendorSlug, RegExp> = {
  anthropic: /\b(anthropic|claude)\b/i,
  openai: /\b(openai|chatgpt|gpt-?\d|sora|codex|dall-?e|o\d-(mini|pro))\b/i,
  google: /\b(google|gemini|deepmind|bard|vertex ai|gemma|alphafold|notebooklm)\b/i,
  microsoft: /\b(microsoft|copilot|azure|bing|phi-\d)\b/i,
  meta: /\b(meta ai|llama|meta's|zuckerberg|\bmeta\b)\b/i,
  amazon: /\b(amazon|aws|bedrock|alexa|nova)\b/i,
  nvidia: /\b(nvidia|cuda|blackwell|rubin|h100|h200|b200|gb200|jensen)\b/i,
  mistral: /\b(mistral|mixtral|le chat)\b/i,
  xai: /\b(xai|grok)\b/i,
  apple: /\b(apple intelligence|apple|siri)\b/i,
  salesforce: /\b(salesforce|agentforce|slack ai|einstein)\b/i,
  databricks: /\b(databricks|mosaic ?ml|dbrx)\b/i,
  snowflake: /\b(snowflake|cortex ai)\b/i,
  huggingface: /\b(hugging ?face)\b/i,
  cohere: /\b(cohere|command r)\b/i,
  deepseek: /\b(deepseek)\b/i,
  perplexity: /\b(perplexity)\b/i,
  ibm: /\b(ibm|watsonx|granite)\b/i,
};

const CATEGORY_PATTERNS: [CategorySlug, RegExp][] = [
  ["deprecation", /\b(deprecat\w*|retir(e|ing|ement)|sunset\w*|end[- ]of[- ]life|shut(ting)? down|discontinu\w*)\b/i],
  ["pricing", /\b(pric(e|es|ing)|cost(s)? (cut|drop)|cheaper|per (million|1m) tokens|free tier|subscription|plan(s)? (for|start))\b/i],
  ["model_release", /\b(releas\w*|launch\w*|introduc\w*|unveil\w*|announc\w*|debut\w*)\b.*\b(model|llm|gpt|claude|gemini|llama|mistral|grok|weights)\b|\b(new|latest) (model|llm)\b/i],
  ["agents", /\b(agent(s|ic)?|computer use|autonomous|workflow automation|mcp|model context protocol|tool use|operator)\b/i],
  ["regulation", /\b(regulat\w*|legislat\w*|\blaw\b|bill|act\b|executive order|ftc|sec\b|eu ai act|compliance|lawsuit|court|copyright|policy|senate|congress|ban(s|ned)?)\b/i],
  ["security", /\b(security|vulnerab\w*|jailbreak\w*|prompt injection|breach|exploit|malware|safety|red[- ]team\w*|misuse|deepfake)\b/i],
  ["funding", /\b(rais(es|ed|ing)|funding|series [a-f]|valuation|acqui(re|res|red|sition)|merger|ipo|invest(s|ment|ed)|billion|\$\d+(\.\d+)?\s?(m|b|bn|million|billion))\b/i],
  ["infrastructure", /\b(gpu(s)?|chip(s)?|data ?cent(er|re)s?|semiconductor|tpu|compute|supercomputer|power grid|nuclear|cluster)\b/i],
  ["research", /\b(paper|research(ers)?|benchmark|study|arxiv|state[- ]of[- ]the[- ]art|sota|we propose|novel method)\b/i],
  ["open_source", /\b(open[- ]source(d)?|open[- ]weight(s)?|github|apache 2\.0|mit license|hugging ?face)\b/i],
  ["enterprise", /\b(enterprise|customer(s)?|deploy(s|ed|ment)|partnership|partner(s|ing)? with|case study|roll(s|ing)? out|productivity|workforce|employees)\b/i],
  ["product_launch", /\b(launch\w*|rolls? out|now available|introduc\w*|new feature|update(s|d)?|app|integrat\w*|beta)\b/i],
];

const INDUSTRY_PATTERNS: Record<IndustrySlug, RegExp> = {
  financial_services: /\b(bank(s|ing)?|financ\w*|fintech|trading|payments?|wealth|jpmorgan|goldman|visa|mastercard)\b/i,
  healthcare: /\b(health\w*|medic\w*|clinic\w*|hospital(s)?|patient(s)?|drug|pharma\w*|biotech|fda|diagnos\w*|protein)\b/i,
  manufacturing: /\b(manufactur\w*|factory|factories|industrial|robot(s|ics)?|supply chain)\b/i,
  retail: /\b(retail\w*|e-?commerce|shopping|consumer(s)?|walmart|shopify)\b/i,
  legal: /\b(legal|lawyer(s)?|law firm(s)?|attorney(s)?|consulting|accounting|audit)\b/i,
  public_sector: /\b(government|federal|public sector|military|defen[cs]e|pentagon|state department|agency)\b/i,
  energy: /\b(energy|utilit(y|ies)|oil|gas|power plant|grid|renewable|nuclear)\b/i,
  media: /\b(media|publisher(s)?|news(rooms?)?|advertis\w*|marketing|hollywood|music|film|video generation)\b/i,
  technology: /\b(software|developer(s)?|coding|saas|cloud|programming|engineer(s|ing)?)\b/i,
  education: /\b(education|school(s)?|student(s)?|universit(y|ies)|teacher(s)?|learning platform)\b/i,
  logistics: /\b(logistic(s)?|shipping|freight|autonomous (vehicle|truck)s?|self-driving|transport\w*|airline(s)?)\b/i,
  insurance: /\b(insur\w*|underwrit\w*|claims processing|actuar\w*)\b/i,
};

const AI_SIGNAL =
  /\b(ai|a\.i\.|artificial intelligence|machine learning|ml|llm(s)?|large language model(s)?|generative|genai|gpt|chatgpt|claude|gemini|llama|copilot|neural|deep learning|transformer(s)?|diffusion|chatbot(s)?|agent(s|ic)?|inference|foundation model(s)?|openai|anthropic|deepmind|mistral|hugging ?face|nvidia)\b/i;

export function isAiRelevant(text: string): boolean {
  return AI_SIGNAL.test(text);
}

export function detectVendors(text: string): VendorSlug[] {
  return (Object.entries(VENDOR_PATTERNS) as [VendorSlug, RegExp][])
    .filter(([, re]) => re.test(text))
    .map(([slug]) => slug);
}

export function detectCategories(text: string, fallback?: string | null): CategorySlug[] {
  const found: CategorySlug[] = [];
  for (const [slug, re] of CATEGORY_PATTERNS) {
    if (re.test(text)) found.push(slug);
    if (found.length >= 3) break;
  }
  if (found.length === 0 && fallback) found.push(fallback as CategorySlug);
  if (found.length === 0) found.push("product_launch");
  return found;
}

export function detectIndustries(text: string): IndustrySlug[] {
  return (Object.entries(INDUSTRY_PATTERNS) as [IndustrySlug, RegExp][])
    .filter(([, re]) => re.test(text))
    .map(([slug]) => slug)
    .slice(0, 3);
}

/** 1–5 importance from source authority, vendor/category signal and coverage breadth. */
export function heuristicImportance(input: {
  authority: number;
  categories: string[];
  vendors: string[];
  articleCount: number;
}): number {
  let score = input.authority >= 5 ? 2.5 : input.authority >= 4 ? 2 : 1.75;
  if (input.categories.some((c) => c === "model_release" || c === "deprecation" || c === "pricing")) score += 0.5;
  if (input.categories.includes("regulation") || input.categories.includes("security")) score += 0.25;
  if (input.vendors.length > 0) score += 0.25;
  score += coverageBoost(input.articleCount);
  return clampImportance(score);
}

export function coverageBoost(articleCount: number) {
  if (articleCount >= 8) return 1.5;
  if (articleCount >= 4) return 1;
  if (articleCount >= 2) return 0.5;
  return 0;
}

export const clampImportance = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

/* ─────────────────────────── Title similarity ─────────────────────────── */

const STOPWORDS = new Set(
  "a an the and or but of to in on for with at by from as is are was were be been it its this that these those how why what who new now just says say said will can could after over into about than more most up out vs via your you we our their they his her".split(
    " ",
  ),
);

export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9.+\- ]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ""))
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

/** Jaccard similarity on content words. ~0.5+ usually means "same event". */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function slugify(input: string, maxLength = 80): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, maxLength)
      .replace(/-+$/g, "") || "story"
  );
}
