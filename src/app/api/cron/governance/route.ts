import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron";
import { sendGovernanceReminders } from "@/lib/governance-reminders.server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, tally: await sendGovernanceReminders() });
}
