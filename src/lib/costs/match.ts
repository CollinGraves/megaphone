/**
 * Suggest which AI project a vendor project/workspace belongs to by comparing names, e.g.
 * OpenAI project "invoice-triage-prod" → "Invoice exception triage". People confirm every match.
 */
const NOISE = new Set(["the", "and", "for", "of", "a", "an", "ai", "llm", "gpt", "claude", "project", "workspace", "prod", "production", "dev", "staging", "test", "api", "app", "v1", "v2", "default"]);

export function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
      .filter((t) => t.length > 1 && !NOISE.has(t)),
  );
}

/** 0 to 1: shared meaningful words, weighted toward the shorter name. */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

export function suggestMatch<T extends { id: string; title: string }>(name: string, projects: T[], threshold = 0.6): T | null {
  let best: { p: T; score: number } | null = null;
  for (const p of projects) {
    const score = nameSimilarity(name, p.title);
    if (score >= threshold && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}
