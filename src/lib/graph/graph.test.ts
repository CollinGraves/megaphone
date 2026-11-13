import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

const { normalizeName, parseFactDate, vendorSlugForName } = await import("./entities");
const { colleagueConfidence } = await import("./stack");
const { daysUntil, deadlineLabel } = await import("./personalize");

describe("graph helpers", () => {
  it("parses only explicit, plausible dates", () => {
    expect(parseFactDate("2026-12-04")).toBe("2026-12-04");
    expect(parseFactDate("2026-12-04T10:00:00Z")).toBe("2026-12-04");
    expect(parseFactDate("2026-02-30")).toBeNull();
    expect(parseFactDate("next month")).toBeNull();
    expect(parseFactDate("1999-01-01")).toBeNull();
    expect(parseFactDate(null)).toBeNull();
  });

  it("normalizes names and maps vendor names to taxonomy slugs", () => {
    expect(normalizeName("  GPT-4o   mini ")).toBe("GPT-4o mini");
    expect(vendorSlugForName("OpenAI")).toBe("openai");
    expect(vendorSlugForName("aws")).toBe("amazon");
    expect(vendorSlugForName("Amazon")).toBe("amazon");
    expect(vendorSlugForName("SAP S/4HANA")).toBeNull();
  });

  it("only trusts colleague signals from two or more people", () => {
    expect(colleagueConfidence(1)).toBe(0);
    expect(colleagueConfidence(2)).toBeCloseTo(0.4);
    expect(colleagueConfidence(4)).toBeCloseTo(0.6);
    expect(colleagueConfidence(50)).toBe(0.8);
  });

  it("counts days until a deadline and labels it", () => {
    const now = new Date("2026-11-13T18:00:00Z");
    expect(daysUntil("2026-11-13", now)).toBe(0);
    expect(daysUntil("2026-12-04", now)).toBe(21);
    expect(deadlineLabel("retires_on")).toBe("retires");
    expect(deadlineLabel("effective_on")).toBe("takes effect");
  });
});
