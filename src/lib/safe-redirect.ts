/** Only allow same-origin relative paths (blocks //evil.com, /\evil.com and absolute URLs). */
export function safeNextPath(next: unknown, fallback: string): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
