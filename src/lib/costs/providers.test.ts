import { describe, expect, it } from "vitest";
import { fetchDailyCosts, mergeRows, parseAnthropicCosts, parseOpenAiCosts, validateKey, type Fetcher } from "./providers";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fake vendor API: routes by path, records every request. */
function fakeApi(routes: Record<string, (url: URL) => Response>) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const fetcher: Fetcher = async (u, init) => {
    const url = new URL(u);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const handler = routes[url.pathname];
    return handler ? handler(url) : json({ error: "not found" }, 404);
  };
  return { fetcher, calls };
}

describe("OpenAI costs", () => {
  it("reads dollars per project and line item, naming projects", () => {
    const rows = parseOpenAiCosts(
      {
        data: [
          {
            start_time: 1794700800, // 2026-11-15
            results: [
              { amount: { value: 12.5, currency: "usd" }, line_item: "gpt-5, input", project_id: "proj_a" },
              { amount: { value: 0, currency: "usd" }, line_item: "x", project_id: "proj_a" },
              { amount: { value: 1.25, currency: "usd" }, line_item: null, project_id: null },
            ],
          },
        ],
      },
      new Map([["proj_a", "invoice-triage"]]),
    );
    expect(rows).toEqual([
      { day: "2026-11-15", dimensionKey: "project:proj_a", dimensionName: "invoice-triage", lineItem: "gpt-5, input", amountUsd: 12.5 },
      { day: "2026-11-15", dimensionKey: "project:none", dimensionName: "No project", lineItem: "", amountUsd: 1.25 },
    ]);
  });

  it("follows pages, groups by project and line item, and sends the admin key as a bearer token", async () => {
    const { fetcher, calls } = fakeApi({
      "/v1/organization/projects": () => json({ data: [{ id: "proj_a", name: "Invoice triage" }], has_more: false }),
      "/v1/organization/costs": (url) =>
        url.searchParams.get("page")
          ? json({ data: [{ start_time: 1794787200, results: [{ amount: { value: 2, currency: "usd" }, line_item: "li", project_id: "proj_a" }] }], has_more: false })
          : json({ data: [{ start_time: 1794700800, results: [{ amount: { value: 3, currency: "usd" }, line_item: "li", project_id: "proj_a" }] }], has_more: true, next_page: "p2" }),
    });
    const rows = await fetchDailyCosts("openai", "sk-admin-test", new Date("2026-11-15T00:00:00Z"), new Date("2026-11-17T00:00:00Z"), fetcher);
    expect(rows.map((r) => [r.day, r.dimensionName, r.amountUsd])).toEqual([
      ["2026-11-15", "Invoice triage", 3],
      ["2026-11-16", "Invoice triage", 2],
    ]);
    const cost = calls.find((c) => c.url.pathname === "/v1/organization/costs")!;
    expect(cost.url.searchParams.getAll("group_by")).toEqual(["project_id", "line_item"]);
    expect(cost.url.searchParams.get("start_time")).toBe("1794700800");
    expect(cost.headers.Authorization).toBe("Bearer sk-admin-test");
  });
});

describe("Anthropic costs", () => {
  it("converts cents to dollars and keeps default-workspace spend", () => {
    const rows = parseAnthropicCosts(
      {
        data: [
          {
            starting_at: "2026-11-15T00:00:00Z",
            results: [
              { amount: "12345.6", currency: "USD", workspace_id: "wrkspc_1", description: "Claude Opus Usage - Input Tokens" },
              { amount: "250", currency: "USD", workspace_id: null, description: null, cost_type: "web_search" },
            ],
          },
        ],
      },
      new Map([["wrkspc_1", "Support bot"]]),
    );
    expect(rows[0]).toMatchObject({ day: "2026-11-15", dimensionKey: "workspace:wrkspc_1", dimensionName: "Support bot", amountUsd: 123.456 });
    expect(rows[1]).toMatchObject({ dimensionKey: "workspace:default", dimensionName: "Default workspace", lineItem: "web_search", amountUsd: 2.5 });
  });

  it("uses x-api-key and asks for workspace and description groups", async () => {
    const { fetcher, calls } = fakeApi({
      "/v1/organizations/workspaces": () => json({ data: [], has_more: false }),
      "/v1/organizations/cost_report": () => json({ data: [{ starting_at: "2026-11-16T00:00:00Z", results: [{ amount: "100", currency: "USD", workspace_id: null }] }], has_more: false }),
    });
    const rows = await fetchDailyCosts("anthropic", "sk-ant-admin01-x", new Date("2026-11-16T00:00:00Z"), new Date("2026-11-17T00:00:00Z"), fetcher);
    expect(rows).toEqual([{ day: "2026-11-16", dimensionKey: "workspace:default", dimensionName: "Default workspace", lineItem: "", amountUsd: 1 }]);
    const cost = calls.find((c) => c.url.pathname === "/v1/organizations/cost_report")!;
    expect(cost.url.searchParams.getAll("group_by[]")).toEqual(["workspace_id", "description"]);
    expect(cost.headers["x-api-key"]).toBe("sk-ant-admin01-x");
  });
});

describe("validateKey", () => {
  it("explains a rejected key and labels an accepted one", async () => {
    const bad = fakeApi({ "/v1/organization/projects": () => json({}, 401) });
    await expect(validateKey("openai", "sk-admin-nope", bad.fetcher)).rejects.toThrow(/didn't accept this key/);
    const good = fakeApi({
      "/v1/organizations/workspaces": () => json({ data: [] }),
      "/v1/organizations/me": () => json({ id: "org_1", name: "North Labs" }),
    });
    await expect(validateKey("anthropic", "sk-ant-admin01-ok", good.fetcher)).resolves.toEqual({ label: "North Labs" });
  });
});

describe("mergeRows", () => {
  it("sums rows that share a day, dimension and line item", () => {
    const r = { day: "2026-11-15", dimensionKey: "project:a", dimensionName: "A", lineItem: "x", amountUsd: 1 };
    expect(mergeRows([r, { ...r, amountUsd: 2 }, { ...r, lineItem: "y" }])).toEqual([{ ...r, amountUsd: 3 }, { ...r, lineItem: "y" }]);
  });
});
