/**
 * Read-only cost connectors for AI vendors. Each one validates an admin key and returns daily
 * spend per vendor project/workspace in USD. Only cost and name-listing endpoints are called.
 *
 * - OpenAI: GET /v1/organization/costs (amount.value is in dollars), names from /v1/organization/projects.
 * - Anthropic: GET /v1/organizations/cost_report (amount is a decimal string in CENTS), names from
 *   /v1/organizations/workspaces. Default-workspace spend comes back with workspace_id null.
 */

export type CostRow = { day: string; dimensionKey: string; dimensionName: string | null; lineItem: string; amountUsd: number };
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export type ApiProviderId = "openai" | "anthropic";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const PROVIDERS: Record<ApiProviderId, { name: string; keyPrefix: string; keyHelp: string; keyHelpUrl: string }> = {
  openai: {
    name: "OpenAI",
    keyPrefix: "sk-admin-",
    keyHelp: "In the OpenAI dashboard, go to Settings, then Organization, then Admin keys. Create a key and paste it here.",
    keyHelpUrl: "https://platform.openai.com/settings/organization/admin-keys",
  },
  anthropic: {
    name: "Anthropic",
    keyPrefix: "sk-ant-admin",
    keyHelp: "In the Claude Console, go to Settings, then Admin keys. Create a key and paste it here. Only organization admins can do this.",
    keyHelpUrl: "https://console.anthropic.com/settings/admin-keys",
  },
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Merge rows that share day + dimension + line item (pages and groupings can split them). */
export function mergeRows(rows: CostRow[]): CostRow[] {
  const byKey = new Map<string, CostRow>();
  for (const r of rows) {
    const k = `${r.day}|${r.dimensionKey}|${r.lineItem}`;
    const prev = byKey.get(k);
    if (prev) prev.amountUsd += r.amountUsd;
    else byKey.set(k, { ...r });
  }
  return [...byKey.values()].filter((r) => r.amountUsd !== 0);
}

async function getJson(fetcher: Fetcher, url: string, headers: Record<string, string>, vendor: string) {
  let res: Response;
  try {
    res = await fetcher(url, { headers, cache: "no-store" });
  } catch {
    throw new ProviderError(`Couldn't reach ${vendor}. Please try again in a few minutes.`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(`${vendor} didn't accept this key. Make sure it's an admin key and hasn't been deleted.`, res.status);
  }
  if (res.status === 429) throw new ProviderError(`${vendor} is limiting requests right now. We'll try again later.`, 429);
  if (!res.ok) throw new ProviderError(`${vendor} returned an error (${res.status}). We'll try again later.`, res.status);
  return res.json() as Promise<unknown>;
}

/* ───────────────────────────── OpenAI ───────────────────────────── */

type OpenAiCostPage = {
  data: { start_time: number; results: { amount?: { value?: number; currency?: string }; line_item?: string | null; project_id?: string | null }[] }[];
  has_more?: boolean;
  next_page?: string | null;
};

export function parseOpenAiCosts(page: OpenAiCostPage, names: Map<string, string>): CostRow[] {
  const rows: CostRow[] = [];
  for (const bucket of page.data ?? []) {
    const d = day(new Date(bucket.start_time * 1000));
    for (const r of bucket.results ?? []) {
      const value = Number(r.amount?.value ?? 0);
      if (!Number.isFinite(value) || value === 0) continue;
      if (r.amount?.currency && r.amount.currency.toLowerCase() !== "usd") continue;
      const pid = r.project_id ?? null;
      rows.push({
        day: d,
        dimensionKey: pid ? `project:${pid}` : "project:none",
        dimensionName: pid ? (names.get(pid) ?? pid) : "No project",
        lineItem: r.line_item ?? "",
        amountUsd: value,
      });
    }
  }
  return rows;
}

const openAiHeaders = (key: string) => ({ Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

async function openAiProjectNames(key: string, fetcher: Fetcher) {
  const names = new Map<string, string>();
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ limit: "100", include_archived: "true", ...(after ? { after } : {}) });
    const page = (await getJson(fetcher, `https://api.openai.com/v1/organization/projects?${qs}`, openAiHeaders(key), "OpenAI")) as {
      data?: { id: string; name: string }[];
      has_more?: boolean;
      last_id?: string;
    };
    for (const p of page.data ?? []) names.set(p.id, p.name);
    if (!page.has_more || !page.last_id) break;
    after = page.last_id;
  }
  return names;
}

/* ───────────────────────────── Anthropic ───────────────────────────── */

type AnthropicCostPage = {
  data: { starting_at: string; results: { amount?: string; currency?: string; workspace_id?: string | null; description?: string | null; cost_type?: string | null }[] }[];
  has_more?: boolean;
  next_page?: string | null;
};

export function parseAnthropicCosts(page: AnthropicCostPage, names: Map<string, string>): CostRow[] {
  const rows: CostRow[] = [];
  for (const bucket of page.data ?? []) {
    const d = bucket.starting_at.slice(0, 10);
    for (const r of bucket.results ?? []) {
      // Amounts are decimal strings in the lowest currency unit: "123.45" USD = $1.2345.
      const cents = Number(r.amount ?? 0);
      if (!Number.isFinite(cents) || cents === 0) continue;
      if (r.currency && r.currency.toUpperCase() !== "USD") continue;
      const wid = r.workspace_id ?? null;
      rows.push({
        day: d,
        dimensionKey: wid ? `workspace:${wid}` : "workspace:default",
        dimensionName: wid ? (names.get(wid) ?? wid) : "Default workspace",
        lineItem: r.description ?? r.cost_type ?? "",
        amountUsd: cents / 100,
      });
    }
  }
  return rows;
}

const anthropicHeaders = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01" });

async function anthropicWorkspaceNames(key: string, fetcher: Fetcher) {
  const names = new Map<string, string>();
  let after: string | undefined;
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ limit: "100", include_archived: "true", ...(after ? { after_id: after } : {}) });
    const page = (await getJson(fetcher, `https://api.anthropic.com/v1/organizations/workspaces?${qs}`, anthropicHeaders(key), "Anthropic")) as {
      data?: { id: string; name: string }[];
      has_more?: boolean;
      last_id?: string;
    };
    for (const w of page.data ?? []) names.set(w.id, w.name);
    if (!page.has_more || !page.last_id) break;
    after = page.last_id;
  }
  return names;
}

/* ───────────────────────────── Shared entry points ───────────────────────────── */

/** Check the key works and return a label for the connected account. */
export async function validateKey(provider: ApiProviderId, key: string, fetcher: Fetcher = fetch): Promise<{ label: string }> {
  if (provider === "openai") {
    await getJson(fetcher, "https://api.openai.com/v1/organization/projects?limit=1", openAiHeaders(key), "OpenAI");
    return { label: "OpenAI organization" };
  }
  await getJson(fetcher, "https://api.anthropic.com/v1/organizations/workspaces?limit=1", anthropicHeaders(key), "Anthropic");
  try {
    const me = (await getJson(fetcher, "https://api.anthropic.com/v1/organizations/me", anthropicHeaders(key), "Anthropic")) as { name?: string };
    return { label: me.name || "Anthropic organization" };
  } catch {
    return { label: "Anthropic organization" };
  }
}

/** Daily spend from `start` (inclusive, UTC day) through `end` (exclusive). */
export async function fetchDailyCosts(provider: ApiProviderId, key: string, start: Date, end: Date, fetcher: Fetcher = fetch): Promise<CostRow[]> {
  const rows: CostRow[] = [];
  if (provider === "openai") {
    const names = await openAiProjectNames(key, fetcher);
    let page: string | undefined;
    for (let i = 0; i < 50; i++) {
      const qs = new URLSearchParams({
        start_time: String(Math.floor(start.getTime() / 1000)),
        end_time: String(Math.floor(end.getTime() / 1000)),
        bucket_width: "1d",
        limit: "180",
      });
      qs.append("group_by", "project_id");
      qs.append("group_by", "line_item");
      if (page) qs.set("page", page);
      const res = (await getJson(fetcher, `https://api.openai.com/v1/organization/costs?${qs}`, openAiHeaders(key), "OpenAI")) as OpenAiCostPage;
      rows.push(...parseOpenAiCosts(res, names));
      if (!res.has_more || !res.next_page) break;
      page = res.next_page;
    }
  } else {
    const names = await anthropicWorkspaceNames(key, fetcher);
    let page: string | undefined;
    for (let i = 0; i < 50; i++) {
      const qs = new URLSearchParams({ starting_at: start.toISOString(), ending_at: end.toISOString(), bucket_width: "1d", limit: "31" });
      qs.append("group_by[]", "workspace_id");
      qs.append("group_by[]", "description");
      if (page) qs.set("page", page);
      const res = (await getJson(fetcher, `https://api.anthropic.com/v1/organizations/cost_report?${qs}`, anthropicHeaders(key), "Anthropic")) as AnthropicCostPage;
      rows.push(...parseAnthropicCosts(res, names));
      if (!res.has_more || !res.next_page) break;
      page = res.next_page;
    }
  }
  return mergeRows(rows);
}
