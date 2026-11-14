import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { briefToMarkdown } from "@/lib/build/export";
import { latestReadyBrief } from "@/lib/build/server";
import { appUrl } from "@/lib/env";
import { slugify } from "@/lib/ingest/heuristics";
import { getWorkspaceOrNotFound } from "@/lib/workspace";

export async function GET(_req: Request, ctx: RouteContext<"/w/[slug]/initiatives/[id]/build/markdown">) {
  const { slug, id } = await ctx.params;
  const ws = await getWorkspaceOrNotFound(slug);
  const [initiative] = await db.select().from(initiatives).where(and(eq(initiatives.id, id), eq(initiatives.orgId, ws.org.id))).limit(1);
  if (!initiative) return new Response("Not found", { status: 404 });
  const latest = await latestReadyBrief(initiative.id);
  if (!latest) return new Response("No build brief yet", { status: 404 });
  const md = briefToMarkdown(latest.brief, {
    title: initiative.title,
    workspace: ws.org.name,
    version: latest.row.version,
    url: `${appUrl()}/w/${ws.org.slug}/initiatives/${initiative.id}/build`,
  });
  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="build-brief-${slugify(initiative.title, 50)}-v${latest.row.version}.md"`,
    },
  });
}
