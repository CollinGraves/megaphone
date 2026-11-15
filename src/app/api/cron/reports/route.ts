import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { sendMonthlyReports } from "@/lib/report/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 1st of each month: email last month's one-page update to each workspace's owners and admins. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, tally: await sendMonthlyReports() });
}
