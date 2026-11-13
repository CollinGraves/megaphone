import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

const { isDigestDue } = await import("./digest");

const monday = new Date("2026-11-16T12:00:00Z");
const saturday = new Date("2026-11-14T12:00:00Z");

describe("isDigestDue", () => {
  it("sends weekly digests on Mondays only, at most once a week", () => {
    expect(isDigestDue({ digestFrequency: "weekly", lastDigestSentAt: null }, monday)).toBe(true);
    expect(isDigestDue({ digestFrequency: "weekly", lastDigestSentAt: null }, saturday)).toBe(false);
    expect(isDigestDue({ digestFrequency: "weekly", lastDigestSentAt: new Date("2026-11-13T12:00:00Z") }, monday)).toBe(false);
  });
  it("sends daily digests on weekdays with a 20h gap", () => {
    expect(isDigestDue({ digestFrequency: "daily", lastDigestSentAt: new Date("2026-11-15T12:00:00Z") }, monday)).toBe(true);
    expect(isDigestDue({ digestFrequency: "daily", lastDigestSentAt: new Date("2026-11-16T02:00:00Z") }, monday)).toBe(false);
    expect(isDigestDue({ digestFrequency: "daily", lastDigestSentAt: null }, saturday)).toBe(false);
  });
  it("never sends when off", () => {
    expect(isDigestDue({ digestFrequency: "off", lastDigestSentAt: null }, monday)).toBe(false);
  });
});

describe("safeNextPath", async () => {
  const { safeNextPath } = await import("./safe-redirect");
  it("allows relative paths and rejects off-site redirects", () => {
    expect(safeNextPath("/w/acme?x=1", "/feed")).toBe("/w/acme?x=1");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", undefined, ["/a"]]) expect(safeNextPath(bad, "/feed")).toBe("/feed");
  });
});

describe("diversify", async () => {
  const { diversify } = await import("./digest");
  const s = (id: string, vendor: string, source: string) => ({ id, vendors: [vendor], primarySourceName: source });
  it("caps stories per vendor and per source, keeping preferred ones first", () => {
    const list = [s("a", "google", "G Blog"), s("b", "google", "G Blog"), s("c", "google", "G Blog"), s("d", "openai", "TechCrunch"), s("e", "openai", "Verge")];
    expect(diversify(list, 10).map((x) => x.id)).toEqual(["a", "b", "d", "e"]);
    expect(diversify(list, 10, new Set(["c"])).map((x) => x.id)).toEqual(["c", "a", "d", "e"]);
    expect(diversify(list, 2).map((x) => x.id)).toEqual(["a", "b"]);
  });
});
