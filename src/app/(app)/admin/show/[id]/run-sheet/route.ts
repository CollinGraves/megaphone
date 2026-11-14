import { eq } from "drizzle-orm";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import { parseRundown, rundownToMarkdown } from "@/lib/show/rundown";
import { episodeStories } from "@/lib/show/server";

export async function GET(_req: Request, { params }: RouteContext<"/admin/show/[id]/run-sheet">) {
  await requireStaff();
  const { id } = await params;
  const [ep] = await db.select().from(episodes).where(eq(episodes.id, id)).limit(1);
  const rundown = ep ? parseRundown(ep.rundown) : null;
  if (!ep || !rundown) return new Response("Not found", { status: 404 });
  const list = await episodeStories(ep);
  const md = rundownToMarkdown(ep, rundown, new Map(list.map((s) => [s.id, s])), appUrl());
  return new Response(md, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="run-sheet-episode-${ep.number}.md"`,
      "cache-control": "private, no-store",
    },
  });
}
