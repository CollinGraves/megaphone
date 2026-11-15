import { describe, expect, it } from "vitest";
import { monthLabel, monthRange, previousMonth, reportToHtml, reportToText, stageMoveFrom, templateSummary, type ReportData } from "./build";

const base: ReportData = {
  month: "2026-10",
  monthLabel: "October 2026",
  totals: { projects: 14, live: 3, testing: 2, building: 4, estimatedAnnualUsd: 1_200_000, actualRunRateUsd: 450_000 },
  monthActuals: { hours: 312, usd: 26_000, projects: 3 },
  launched: ["Invoice triage", "Sales notes"],
  movedForward: [{ title: "Forecasting", to: "Pilot" }],
  added: ["HR chatbot"],
  blocked: [{ title: "Claims bot", reason: "Waiting on access to the claims inbox" }],
  awaitingApproval: ["Candidate screening"],
  ideas: { new: 4, open: 9 },
  top: [{ title: "Invoice triage", stage: "Production", valueUsd: 412_000 }],
  needsActuals: ["Sales notes"],
};

describe("months", () => {
  it("labels, steps back and bounds months in UTC", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(previousMonth(new Date("2026-11-01T14:17:00Z"))).toBe("2026-10");
    expect(previousMonth(new Date("2027-01-15T00:00:00Z"))).toBe("2026-12");
    expect(monthRange("2026-12")).toEqual({ start: new Date("2026-12-01T00:00:00Z"), end: new Date("2027-01-01T00:00:00Z") });
  });

  it("finds stage moves in activity change lists", () => {
    expect(stageMoveFrom(["health to At risk", "stage to Pilot"])).toBe("Pilot");
    expect(stageMoveFrom(["prioritization scores"])).toBeNull();
    expect(stageMoveFrom(undefined)).toBeNull();
  });
});

describe("templateSummary", () => {
  it("reads like a short update", () => {
    expect(templateSummary(base, "Acme")).toBe(
      "In October 2026, Acme had 14 AI projects, and 3 are live. 2 projects went live: Invoice triage and Sales notes. Projects with results saved about 312 hours, worth about $26,000 last month. 1 project is blocked, and 1 is waiting for approval. People sent in 4 new ideas.",
    );
  });

  it("handles a quiet month without awkward phrasing", () => {
    const quiet = { ...base, totals: { ...base.totals, live: 1 }, launched: [], movedForward: [], blocked: [], monthActuals: { hours: 0, usd: 0, projects: 0 }, ideas: { new: 0, open: 0 } };
    const text = templateSummary(quiet, "Acme");
    expect(text).toContain("and 1 is live.");
    expect(text).toContain("No results were recorded for last month yet.");
    expect(text).toContain("1 project is waiting for approval.");
    expect(text).not.toMatch(/—/);
    const soFar = templateSummary(quiet, "Acme", { soFar: true });
    expect(soFar).toMatch(/^So far in October 2026, Acme has 14 AI projects/);
    expect(soFar).toContain("No results were recorded yet this month.");
  });
});

describe("renderers", () => {
  it("renders text and escaped HTML with the link", () => {
    const text = reportToText(base, "Acme", "Summary.", "https://x.test/w/acme/report");
    expect(text).toContain("Acme: AI update for October 2026");
    expect(text).toContain("- Claims bot: Waiting on access to the claims inbox");
    expect(text).toContain("Value per year: $450,000 (from real results)");
    const html = reportToHtml({ ...base, launched: ["<script>x</script>"] }, "Acme & Co", "Summary.", "https://x.test/r");
    expect(html).toContain("Acme &amp; Co");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://x.test/r"');
  });
});
