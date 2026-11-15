import { describe, expect, it } from "vitest";
import { normalizeItem, platformsIn, readPastedList, stageFrom, titleKey } from "./parse";

describe("readPastedList: tables", () => {
  it("reads a CSV with a header row, mapping columns, stages and platforms", () => {
    const csv = [
      "Project,Description,Team,Owner,Tool,Status,Hours saved",
      '"Invoice triage","Route AP exceptions, faster",Finance,Dana,ChatGPT Enterprise,Pilot,40',
      "Sales call notes,Summaries after calls,Sales,,Copilot,live,",
    ].join("\n");
    const items = readPastedList(csv);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Invoice triage", problem: "Route AP exceptions, faster", businessUnit: "Finance", owner: "Dana", platforms: ["openai"], stage: "pilot", hoursSavedPerMonth: 40 });
    expect(items[1]).toMatchObject({ title: "Sales call notes", platforms: ["microsoft"], stage: "production", owner: null, hoursSavedPerMonth: null });
  });

  it("reads tab-separated rows pasted from a spreadsheet", () => {
    const items = readPastedList("Name\tNotes\nContract review\tLegal spends hours on NDAs\n");
    expect(items).toEqual([expect.objectContaining({ title: "Contract review", problem: "Legal spends hours on NDAs" })]);
  });
});

describe("readPastedList: mixed", () => {
  it("reads a table followed by loose bullets without mangling the bullets", () => {
    const items = readPastedList("Project,Team\nInvoice triage,Finance\n- HR policy chatbot: people ask about PTO\n- Demand forecasting with Gemini");
    expect(items.map((i) => i.title)).toEqual(["Invoice triage", "HR policy chatbot", "Demand forecasting with Gemini"]);
    expect(items[1].problem).toBe("people ask about PTO");
  });
});

describe("readPastedList: lists and notes", () => {
  it("reads bullets, numbered lines and 'title: details', with indented details", () => {
    const text = [
      "- Chatbot for HR questions: employees ask about PTO all day",
      "  - using Claude, still an idea",
      "2. Forecasting demand - in testing with Gemini",
      "• Quote follow-ups",
      "",
    ].join("\n");
    const items = readPastedList(text);
    expect(items.map((i) => i.title)).toEqual(["Chatbot for HR questions", "Forecasting demand", "Quote follow-ups"]);
    expect(items[0]).toMatchObject({ problem: "employees ask about PTO all day using Claude, still an idea", platforms: ["anthropic"], stage: "idea" });
    expect(items[1]).toMatchObject({ platforms: ["google"], stage: "pilot" });
  });

  it("skips too-short lines and caps the count", () => {
    expect(readPastedList("ok\n\n- a\n- Real project")).toHaveLength(1);
    expect(readPastedList(Array.from({ length: 80 }, (_, i) => `- Project number ${i}`).join("\n"))).toHaveLength(50);
  });
});

describe("normalizeItem", () => {
  it("clamps scores, drops unknown platforms and bad stages, ignores non-positive hours", () => {
    expect(
      normalizeItem({ title: "  Expense audit  ", problem: "x", solution: "", business_unit: "", owner: null, platforms: ["OPENAI", "made-up"], stage: "nonsense" as never, value_score: 9, feasibility_score: 0, hours_saved_per_month: -4 }),
    ).toEqual({ title: "Expense audit", problem: "x", solution: "", businessUnit: null, owner: null, platforms: ["openai"], stage: "idea", valueScore: 5, feasibilityScore: 1, hoursSavedPerMonth: null });
    expect(normalizeItem({ title: "ab" })).toBeNull();
  });

  it("maps words to stages and products to vendors", () => {
    expect(stageFrom("Rolled out in March")).toBe("production");
    expect(stageFrom("PoC")).toBe("pilot");
    expect(stageFrom(null)).toBe("idea");
    expect(platformsIn("Power Automate flow calling GPT-4o and Claude")).toEqual(["openai", "microsoft", "anthropic"]);
    expect(titleKey("Invoice  Triage!")).toBe("invoice triage");
  });
});
