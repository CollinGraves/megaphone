import { clsx, type ClassValue } from "clsx";
import { formatDistanceToNowStrict } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(date: Date | string) {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

export function formatDate(date: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  if (!date) return "—";
  const d = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
  return d.toLocaleDateString("en-US", opts);
}

const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const usdFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const numCompact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const numFull = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatUsd(n: number | null | undefined, compact = false) {
  if (n == null || Number.isNaN(n)) return "—";
  return compact && Math.abs(n) >= 10_000 ? usdCompact.format(n) : usdFull.format(n);
}

export function formatNumber(n: number | null | undefined, compact = false) {
  if (n == null || Number.isNaN(n)) return "—";
  return compact && Math.abs(n) >= 10_000 ? numCompact.format(n) : numFull.format(n);
}

/** Read a string field from FormData (trimmed, empty → null). */
export function str(form: FormData, key: string): string | null {
  const v = form.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function strs(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function num(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (v == null) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Shape returned by server actions used with useActionState. */
export type ActionState = { ok?: boolean; error?: string; message?: string } | null;
