import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { syncAllConnections } from "@/lib/costs/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Nightly: refresh the last week of spend for every connected AI vendor. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tally = await syncAllConnections();
  return NextResponse.json({ ok: true, tally });
}
