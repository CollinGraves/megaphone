import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { ticketsToJiraCsv } from "@/lib/build/export";
import { latestReadyBrief } from "@/lib/build/server";
import { slugify } from "@/lib/ingest/heuristics";
import { getWorkspaceOrNotFound } from "@/lib/workspace";

/** Developer tickets from the latest brief, in Jira's CSV import format. */
export async function GET(_req: Request, ctx: RouteContext<"/w/[slug]/initiatives/[id]/build/tickets">) {
  const { slug, id } = await ctx.params;
  const ws = await getWorkspaceOrNotFound(slug);
  const [initiative] = await db.select().from(initiatives).where(and(eq(initiatives.id, id), eq(initiatives.orgId, ws.org.id))).limit(1);
  if (!initiative) return new Response("Not found", { status: 404 });
  const latest = await latestReadyBrief(initiative.id);
  if (!latest) return new Response("No build brief yet", { status: 404 });
  return new Response("﻿" + ticketsToJiraCsv(latest.brief, `ai-${slugify(initiative.title, 30)}`), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tickets-${slugify(initiative.title, 50)}.csv"`,
    },
  });
}
