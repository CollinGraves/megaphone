import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
const { usedByLabel } = await import("./workspace-news");

describe("usedByLabel", () => {
  it("names one project, or the first plus a count", () => {
    expect(usedByLabel([])).toBe("");
    expect(usedByLabel(["Invoice triage"])).toBe("Used by Invoice triage");
    expect(usedByLabel(["Invoice triage", "Sales notes", "HR bot"])).toBe("Used by Invoice triage and 2 more");
  });
});
