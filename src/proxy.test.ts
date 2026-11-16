import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("./proxy")).proxy;
}
const req = (url: string, cookie?: string) =>
  new NextRequest(url, { headers: { host: new URL(url).host, ...(cookie ? { cookie } : {}) } });

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("sends production page requests on old hosts to the canonical domain, keeping path and query", async () => {
    const proxy = await load({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://radar.northlabs.io" });
    const res = proxy(req("https://ai-radar-north-labs.vercel.app/news/some-story?x=1"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://radar.northlabs.io/news/some-story?x=1");
  });

  it("leaves the canonical host, previews and local dev alone", async () => {
    let proxy = await load({ VERCEL_ENV: "production", NEXT_PUBLIC_APP_URL: "https://radar.northlabs.io" });
    expect(proxy(req("https://radar.northlabs.io/pricing")).headers.get("location")).toBeNull();
    proxy = await load({ VERCEL_ENV: "preview", NEXT_PUBLIC_APP_URL: "https://radar.northlabs.io" });
    expect(proxy(req("https://ai-radar-git-x.vercel.app/pricing")).headers.get("location")).toBeNull();
  });

  it("gates signed-in areas without a session cookie, but not public pages", async () => {
    const proxy = await load({ VERCEL_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" });
    const gated = proxy(req("http://localhost:3000/w/acme/report?month=2026-10"));
    expect(gated.headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fw%2Facme%2Freport%3Fmonth%3D2026-10");
    for (const p of ["/", "/workspace", "/news", "/pricing"]) expect(proxy(req(`http://localhost:3000${p}`)).headers.get("location")).toBeNull();
    expect(proxy(req("http://localhost:3000/workspaces/new")).headers.get("location")).toContain("/sign-in");
  });
});
