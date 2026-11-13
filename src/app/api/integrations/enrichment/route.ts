import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyEnrichment, EnrichmentPayload } from "@/lib/enrichment";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.ENRICHMENT_API_SECRET;
  if (!secret) return false;
  const a = Buffer.from(request.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Inbound company enrichment (e.g. from a Clay HTTP API column).
 * Body: { domain, name?, industry?, employee_count?, headquarters?, linkedin_url?, website?,
 *         description?, source?, contacts?: [{ name, title?, email?, linkedin_url? }] }
 * Also accepts an array of such objects.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 100) return NextResponse.json({ error: "Send 1–100 records" }, { status: 400 });
  const results = [];
  for (const item of items) {
    const parsed = EnrichmentPayload.safeParse(item);
    if (!parsed.success) {
      results.push({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid record" });
      continue;
    }
    results.push({ ok: true, ...(await applyEnrichment(parsed.data, item)) });
  }
  return NextResponse.json({ results });
}
