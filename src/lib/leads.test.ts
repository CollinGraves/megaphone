import { describe, expect, it, vi } from "vitest";

// leads.ts also exports DB query helpers; keep the pure functions testable without a database.
vi.mock("@/db", () => ({ db: {} }));

import {
  csvCell,
  detectSeniority,
  emptyEngagement,
  isWorkEmail,
  LEAD_CSV_COLUMNS,
  leadsToCsv,
  scoreLead,
  sortLeads,
  splitName,
  tierFor,
  type LeadRow,
  type LeadSignals,
} from "./leads";

const NOW = new Date("2026-11-13T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

const blank = (overrides: Partial<LeadSignals> = {}): LeadSignals => ({
  email: "someone@gmail.com",
  company: null,
  jobTitle: null,
  industry: null,
  companySize: null,
  onboarded: false,
  interestCount: 0,
  digestSubscribed: false,
  engagement: emptyEngagement(),
  lastEngagedAt: null,
  contactRequests: 0,
  lastContactRequestAt: null,
  workspaceCount: 0,
  ...overrides,
});

const fullProfile = (overrides: Partial<LeadSignals> = {}) =>
  blank({
    email: "dana@acme-corp.com",
    company: "Acme Corp",
    jobTitle: "Software Engineer",
    industry: "manufacturing",
    companySize: "201–1,000",
    onboarded: true,
    interestCount: 6,
    digestSubscribed: true,
    ...overrides,
  });

const points = (s: LeadSignals, component: string) =>
  scoreLead(s, NOW).reasons.find((r) => r.component === component)?.points ?? 0;

describe("detectSeniority", () => {
  it.each([
    ["Chief Technology Officer", "c_level"],
    ["CTO", "c_level"],
    ["Co-founder & CEO", "c_level"],
    ["President", "c_level"],
    ["Vice President, Operations", "vp"],
    ["SVP Engineering", "vp"],
    ["Head of AI", "vp"],
    ["Director of Data Science", "director"],
    ["Engineering Manager", "manager"],
    ["Tech Lead", "manager"],
    ["Data Analyst", "individual"],
    ["", "unknown"],
    [null, "unknown"],
  ] as const)("%s → %s", (title, level) => {
    expect(detectSeniority(title).level).toBe(level);
  });

  it("does not treat 'Vice President' as C-level", () => {
    expect(detectSeniority("Vice President of Sales").points).toBe(12);
  });
});

describe("isWorkEmail", () => {
  it("rejects free-mail domains and accepts company domains", () => {
    expect(isWorkEmail("a@gmail.com")).toBe(false);
    expect(isWorkEmail("a@Outlook.com")).toBe(false);
    expect(isWorkEmail("a@acme.io")).toBe(true);
    expect(isWorkEmail("not-an-email")).toBe(false);
  });
});

describe("scoreLead", () => {
  it("scores an empty free-mail signup at zero with no reasons", () => {
    const result = scoreLead(blank(), NOW);
    expect(result.score).toBe(0);
    expect(result.reasons).toEqual([]);
    expect(result.tier).toBe("cold");
  });

  it("awards up to 20 points for a complete profile", () => {
    expect(points(fullProfile(), "profile")).toBe(20);
    expect(points(blank({ company: "Acme", jobTitle: "Engineer" }), "profile")).toBe(6);
  });

  it("awards work email and company size points", () => {
    expect(points(fullProfile(), "workEmail")).toBe(5);
    expect(points(fullProfile({ companySize: "1–50" }), "size")).toBe(2);
    expect(points(fullProfile({ companySize: "5,001+" }), "size")).toBe(15);
    expect(points(fullProfile({ companySize: "unknown" }), "size")).toBe(0);
  });

  it("weights seniority keywords in the job title", () => {
    expect(points(fullProfile({ jobTitle: "VP Engineering" }), "seniority")).toBe(12);
    expect(points(fullProfile({ jobTitle: "Founder" }), "seniority")).toBe(15);
    expect(points(fullProfile(), "seniority")).toBe(0);
  });

  it("weights engagement by type and discounts older activity", () => {
    const recent = emptyEngagement();
    recent.cta_click = { recent: 1, total: 1 };
    recent.story_view = { recent: 4, total: 4 };
    expect(points(blank({ engagement: recent }), "engagement")).toBe(10); // 6 + 4

    const stale = emptyEngagement();
    stale.story_view = { recent: 0, total: 8 };
    expect(points(blank({ engagement: stale }), "engagement")).toBe(2); // 8 × 0.25
  });

  it("caps engagement at 25 points", () => {
    const heavy = emptyEngagement();
    heavy.story_view = { recent: 200, total: 400 };
    expect(points(blank({ engagement: heavy }), "engagement")).toBe(25);
  });

  it("rewards recent activity and decays with time", () => {
    expect(points(blank({ lastEngagedAt: daysAgo(1) }), "recency")).toBe(10);
    expect(points(blank({ lastEngagedAt: daysAgo(10) }), "recency")).toBe(5);
    expect(points(blank({ lastEngagedAt: daysAgo(60) }), "recency")).toBe(1);
    expect(points(blank({ lastEngagedAt: daysAgo(200) }), "recency")).toBe(0);
  });

  it("uses a recent contact request for recency", () => {
    expect(points(blank({ lastEngagedAt: daysAgo(100), lastContactRequestAt: daysAgo(2) }), "recency")).toBe(10);
  });

  it("adds strong intent signals for contact requests and workspace membership", () => {
    expect(points(blank({ contactRequests: 2 }), "contact")).toBe(20);
    expect(points(blank({ workspaceCount: 1 }), "workspace")).toBe(10);
  });

  it("caps the total at 100 and marks it hot", () => {
    const engagement = emptyEngagement();
    engagement.cta_click = { recent: 5, total: 5 };
    const result = scoreLead(
      fullProfile({
        jobTitle: "Chief Data Officer",
        companySize: "5,001+",
        engagement,
        lastEngagedAt: daysAgo(0),
        contactRequests: 1,
        lastContactRequestAt: daysAgo(0),
        workspaceCount: 1,
      }),
      NOW,
    );
    expect(result.score).toBe(100);
    expect(result.tier).toBe("hot");
    expect(result.seniority).toBe("c_level");
  });

  it("returns reasons sorted by contribution that add up to the score when uncapped", () => {
    const result = scoreLead(fullProfile({ jobTitle: "Director of IT", lastEngagedAt: daysAgo(5) }), NOW);
    expect(result.score).toBe(result.reasons.reduce((sum, r) => sum + r.points, 0));
    const pts = result.reasons.map((r) => r.points);
    expect(pts).toEqual([...pts].sort((a, b) => b - a));
    expect(result.score).toBe(20 + 5 + 9 + 9 + 8);
    expect(result.tier).toBe("warm");
  });

  it("is deterministic for a fixed clock", () => {
    const s = fullProfile({ lastEngagedAt: daysAgo(3) });
    expect(scoreLead(s, NOW)).toEqual(scoreLead(s, NOW));
  });
});

describe("tierFor", () => {
  it("buckets scores", () => {
    expect(tierFor(70)).toBe("hot");
    expect(tierFor(69)).toBe("warm");
    expect(tierFor(40)).toBe("warm");
    expect(tierFor(39)).toBe("cold");
  });
});

const lead = (overrides: Partial<LeadRow> & { id: string }): LeadRow => {
  const signals = fullProfile();
  return {
    name: "Dana Smith",
    email: signals.email,
    company: signals.company,
    jobTitle: signals.jobTitle,
    industry: signals.industry,
    companySize: signals.companySize,
    signedUpAt: daysAgo(30),
    onboardedAt: daysAgo(30),
    status: "new",
    notes: null,
    ownerId: null,
    ownerName: null,
    ownerEmail: null,
    interests: { categories: ["agents"], vendors: ["anthropic", "openai"], industries: [] },
    digestFrequency: "weekly",
    lastActivityAt: daysAgo(1),
    signals,
    score: scoreLead(signals, NOW),
    ...overrides,
  };
};

describe("sortLeads", () => {
  it("sorts by score descending by default and by name ascending", () => {
    const a = lead({ id: "a", name: "Zed", score: { ...scoreLead(blank(), NOW), score: 10 } });
    const b = lead({ id: "b", name: "Amy", score: { ...scoreLead(blank(), NOW), score: 80 } });
    expect(sortLeads([a, b], "score").map((l) => l.id)).toEqual(["b", "a"]);
    expect(sortLeads([a, b], "name").map((l) => l.id)).toEqual(["b", "a"]);
    expect(sortLeads([a, b], "score", "asc").map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("CSV export", () => {
  it("splits names for CRM first/last fields", () => {
    expect(splitName("Dana Smith")).toEqual({ first: "Dana", last: "Smith" });
    expect(splitName("Mary Ann de Vries")).toEqual({ first: "Mary Ann de", last: "Vries" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: "" });
  });

  it("quotes cells and neutralises formula injection", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-01-02T03:04:05Z"))).toBe("2026-01-02T03:04:05.000Z");
  });

  it("writes a header plus one row per lead with stable columns", () => {
    const csv = leadsToCsv([lead({ id: "u1", notes: "Met at conf, wants a call" })], "https://radar.example");
    const [header, row, trailing] = csv.split("\r\n");
    expect(header.split(",")).toEqual([...LEAD_CSV_COLUMNS]);
    expect(row.startsWith("u1,dana@acme-corp.com,Dana,Smith,Dana Smith,")).toBe(true);
    expect(row).toContain('"Met at conf, wants a call"');
    expect(row).toContain("anthropic;openai");
    expect(row.endsWith("https://radar.example/admin/leads/u1")).toBe(true);
    expect(trailing).toBe("");
  });
});
