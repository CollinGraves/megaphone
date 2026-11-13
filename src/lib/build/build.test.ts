import { describe, expect, it } from "vitest";
import { briefsPerMonth } from "@/lib/plans";
import type { BriefContext } from "./context";
import { formatContext } from "./context";
import { briefToMarkdown, ticketsToJiraCsv } from "./export";
import { BuildBriefSchema, parseBrief } from "./schema";
import { templateBrief } from "./template";

const base: BriefContext = {
  org: { name: "Acme Logistics", industry: "Logistics", defaultHourlyRate: 85 },
  initiative: {
    title: "Invoice triage assistant",
    problem: "AP clerks spend hours routing invoices. Errors delay payments.",
    solution: "Classify incoming invoices and draft the routing decision.",
    businessUnit: "Finance",
    stage: "evaluating",
    platforms: [],
    models: [],
    buildApproach: null,
    riskTier: "low",
    customerFacing: false,
    affectsIndividuals: false,
    humanOversight: null,
    targetDate: null,
  },
  metrics: [{ name: "Hours saved", type: "hours_saved", unit: "hours", period: "monthly", estimatedValue: 120, assumptions: null }],
  dependencies: [],
  portfolioPlatforms: [],
  systems: [],
  stack: [],
  guidance: null,
};

const withDeps = (sensitivity = "internal"): BriefContext => ({
  ...base,
  dependencies: [
    { system: "NetSuite", category: "erp", vendor: "Oracle", data: "Vendor master and open invoices", access: "requested", sensitivity },
    { system: "Outlook", category: "email", vendor: "Microsoft", data: "AP inbox", access: "granted", sensitivity: "internal" },
  ],
});

describe("templateBrief", () => {
  it("produces a schema-valid brief", () => {
    const b = templateBrief(base);
    expect(BuildBriefSchema.safeParse(b).success).toBe(true);
    expect(b.options).toHaveLength(3);
    expect(b.summary).toContain("Template brief");
  });

  it("recommends configuring an existing tool for simple, low-risk work", () => {
    expect(templateBrief(base).recommended_option).toBe(0);
  });

  it("prefers the company's existing platform", () => {
    expect(templateBrief({ ...base, portfolioPlatforms: ["Microsoft"] }).options[0].platform).toMatch(/Copilot Studio/);
    expect(templateBrief({ ...base, stack: ["ChatGPT Enterprise"] }).options[0].platform).toMatch(/ChatGPT/);
    expect(templateBrief({ ...base, portfolioPlatforms: ["Anthropic"] }).options[0].platform).toMatch(/Claude/);
  });

  it("steps up to low-code when several systems are involved", () => {
    expect(templateBrief(withDeps()).recommended_option).toBe(1);
  });

  it("recommends a custom build for high-risk, integration-heavy work with regulated data", () => {
    const b = templateBrief({ ...withDeps("pii"), initiative: { ...base.initiative, riskTier: "high" } });
    expect(b.recommended_option).toBe(2);
    expect(b.requirements.non_functional.join(" ")).toMatch(/PII/);
    expect(b.ai_design.human_oversight).toMatch(/final decision/);
  });

  it("keeps a reviewer in the workflow for customer-facing work", () => {
    const b = templateBrief({ ...base, initiative: { ...base.initiative, customerFacing: true } });
    expect(b.workflow.join(" ")).toMatch(/before anything reaches a customer/);
  });

  it("asks about access that hasn't been granted and makes access tickets", () => {
    const b = templateBrief(withDeps());
    expect(b.open_questions).toContain("When can access to NetSuite be granted?");
    expect(b.open_questions.join(" ")).not.toMatch(/Outlook/);
    expect(b.tickets.map((t) => t.title)).toContain("Set up read access to NetSuite");
  });
});

describe("parseBrief", () => {
  it("rejects malformed content", () => {
    expect(parseBrief(null)).toBeNull();
    expect(parseBrief({ summary: "x" })).toBeNull();
  });

  it("clamps an out-of-range recommended option", () => {
    const b = templateBrief(base);
    expect(parseBrief({ ...b, recommended_option: 7 })?.recommended_option).toBe(b.options.length - 1);
  });
});

describe("exports", () => {
  it("renders Markdown with the recommendation, prompt and tickets", () => {
    const b = templateBrief(withDeps());
    const md = briefToMarkdown(b, { title: "Invoice triage assistant", workspace: "Acme", version: 2, url: "https://x.test/build" });
    expect(md).toContain("# Build brief: Invoice triage assistant");
    expect(md).toContain("version 2");
    expect(md).toContain(`## Recommended approach: ${b.options[b.recommended_option].name}`);
    expect(md).toContain(b.ai_design.system_prompt);
    expect(md).toContain("| NetSuite |");
    expect(md).toContain("## Work items");
  });

  it("writes a Jira CSV with escaping and formula-injection protection", () => {
    const b = templateBrief(base);
    b.tickets = [{ title: "=HYPERLINK(\"evil\")", description: "Line one, with comma", acceptance: ["Works"], estimate: "M" }];
    const csv = ticketsToJiraCsv(b, "ai-radar");
    const [header, row] = csv.trim().split("\r\n");
    expect(header).toBe("Summary,Description,Issue Type,Labels,Original Estimate");
    expect(row.startsWith(`"'=HYPERLINK(""evil"")"`)).toBe(true);
    expect(row).toContain("Task,ai-radar,24h");
  });
});

describe("context + quotas", () => {
  it("includes governance and guidance in the prompt context", () => {
    const text = formatContext({ ...base, guidance: "Must run inside Teams" });
    expect(text).toContain("Risk tier: low");
    expect(text).toContain("<requester_guidance>\nMust run inside Teams");
    expect(formatContext(base)).not.toContain("requester_guidance");
  });

  it("gives every self-serve plan a monthly brief allowance", () => {
    expect(briefsPerMonth("trial")).toBe(3);
    expect(briefsPerMonth("team")).toBe(15);
    expect(briefsPerMonth("business")).toBe(60);
    expect(briefsPerMonth("engagement")).toBeNull();
  });
});
