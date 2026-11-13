import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { runIngestion } from "@/lib/ingest/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stats = await runIngestion({ trigger: "cron" });
  return NextResponse.json({ ok: true, stats });
}
