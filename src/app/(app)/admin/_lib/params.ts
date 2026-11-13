export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of a search param, trimmed; empty → undefined. */
export function param(sp: SearchParams, key: string): string | undefined {
  const raw = sp[key];
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return v ? v : undefined;
}

/** Narrow a search param to one of a fixed set of values. */
export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function intParam(sp: SearchParams, key: string, { min, max }: { min: number; max: number }): number | undefined {
  const n = Number(param(sp, key));
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** Build a query string from defined values (used for filter-preserving links). */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  const s = usp.toString();
  return s ? `?${s}` : "";
}
