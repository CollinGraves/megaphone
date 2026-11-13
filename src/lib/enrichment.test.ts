import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

const { EnrichmentPayload, sizeRangeFor } = await import("./enrichment");

describe("enrichment", () => {
  it("maps employee counts to size ranges", () => {
    expect(sizeRangeFor(12)).toBe("1–50");
    expect(sizeRangeFor(200)).toBe("51–200");
    expect(sizeRangeFor(4500)).toBe("1,001–5,000");
    expect(sizeRangeFor(90000)).toBe("5,001+");
    expect(sizeRangeFor(null)).toBeNull();
  });
  it("validates inbound payloads and normalizes empty strings", () => {
    const parsed = EnrichmentPayload.parse({ domain: "Acme.com", name: "", employee_count: "1200", contacts: [{ name: "Ann Lee", email: "ann@acme.com" }] });
    expect(parsed.domain).toBe("acme.com");
    expect(parsed.name).toBeNull();
    expect(parsed.employee_count).toBe(1200);
    expect(EnrichmentPayload.safeParse({ domain: "a" }).success).toBe(false);
  });
});
