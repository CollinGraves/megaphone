import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { sendDueDigests } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tally = await sendDueDigests();
  return NextResponse.json({ ok: true, tally });
}
