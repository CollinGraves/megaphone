import { LEAD_SORTS, LEAD_STATUSES, type LeadFilters } from "@/lib/leads";
import { INDUSTRY_SLUGS } from "@/lib/taxonomy";
import { intParam, oneOf, param, type SearchParams } from "../_lib/params";

export const MIN_SCORE_OPTIONS = [20, 40, 70] as const;

/** Shared by the leads page and the CSV export so "export" always matches what's on screen. */
export function parseLeadFilters(sp: SearchParams, meId: string): LeadFilters {
  const owner = param(sp, "owner");
  return {
    search: param(sp, "q")?.slice(0, 100),
    status: oneOf(param(sp, "status"), LEAD_STATUSES),
    industry: oneOf(param(sp, "industry"), INDUSTRY_SLUGS),
    minScore: intParam(sp, "minScore", { min: 1, max: 100 }),
    owner: owner === "me" ? meId : owner,
    sort: oneOf(param(sp, "sort"), LEAD_SORTS) ?? "score",
    dir: oneOf(param(sp, "dir"), ["asc", "desc"] as const),
  };
}

export function searchParamsToRecord(usp: URLSearchParams): SearchParams {
  const out: SearchParams = {};
  for (const key of new Set(usp.keys())) {
    const all = usp.getAll(key);
    out[key] = all.length > 1 ? all : all[0];
  }
  return out;
}
