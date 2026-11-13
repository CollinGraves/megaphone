import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import { leadsToCsv, listLeads } from "@/lib/leads";
import { isStaff } from "@/lib/permissions";
import { parseLeadFilters, searchParamsToRecord } from "../filters";

export const dynamic = "force-dynamic";

/** CSV of the current leads view (same filters/sort as /admin/leads), for import into the CRM. */
export async function GET(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return new Response("Unauthorized", { status: 401 });
  if (!isStaff(me.platformRole)) return new Response("Forbidden", { status: 403 });

  const filters = parseLeadFilters(searchParamsToRecord(request.nextUrl.searchParams), me.id);
  const leads = await listLeads(filters);
  const csv = leadsToCsv(leads, appUrl());
  const date = new Date().toISOString().slice(0, 10);

  // Leading BOM so Excel detects UTF-8; CRMs ignore it.
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ai-radar-leads-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
