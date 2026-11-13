import { describe, expect, it } from "vitest";
import { detectCategories, detectVendors, heuristicImportance, isAiRelevant, slugify, titleSimilarity } from "./heuristics";

describe("heuristic classifier", () => {
  it("detects vendors", () => {
    expect(detectVendors("Anthropic releases Claude for Excel; Microsoft Copilot responds")).toEqual(
      expect.arrayContaining(["anthropic", "microsoft"]),
    );
    expect(detectVendors("A quiet day in gardening")).toEqual([]);
  });

  it("detects categories, preferring specific ones", () => {
    expect(detectCategories("OpenAI to retire GPT-4o from the API next month")).toContain("deprecation");
    expect(detectCategories("EU AI Act enforcement begins")).toContain("regulation");
    expect(detectCategories("Nothing obvious here", "research")).toEqual(["research"]);
  });

  it("filters non-AI items", () => {
    expect(isAiRelevant("New LLM benchmark released")).toBe(true);
    expect(isAiRelevant("Quarterly earnings call schedule")).toBe(false);
  });

  it("scores importance within 1–5 and rewards coverage", () => {
    const base = { authority: 3, categories: ["research"], vendors: [] as string[], articleCount: 1 };
    const single = heuristicImportance(base);
    const covered = heuristicImportance({ ...base, articleCount: 8 });
    expect(single).toBeGreaterThanOrEqual(1);
    expect(covered).toBeGreaterThan(single);
    expect(heuristicImportance({ authority: 5, categories: ["model_release"], vendors: ["openai"], articleCount: 20 })).toBe(5);
  });

  it("matches near-duplicate headlines but not unrelated ones", () => {
    expect(titleSimilarity("OpenAI launches GPT-6 with longer context", "GPT-6 launches: OpenAI adds longer context")).toBeGreaterThan(0.5);
    expect(titleSimilarity("OpenAI launches GPT-6", "Nvidia earnings beat expectations")).toBeLessThan(0.2);
  });

  it("slugifies titles", () => {
    expect(slugify("Gemini 4 — what’s new?")).toBe("gemini-4-whats-new");
  });
});
