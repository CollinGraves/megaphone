"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { episodes, type Episode } from "@/db/schema";
import { requireStaff } from "@/lib/auth/session";
import { appUrl } from "@/lib/env";
import {
  customSegment,
  dataSegment,
  editSegments,
  insertSegment,
  MIN_ORGS,
  parseRundown,
  showNotesFromRundown,
  storyIdsOf,
  type Rundown,
  type Segment,
} from "@/lib/show/rundown";
import { buildLiveFromIdea, createEpisode, episodeStories, loadInsights, refreshEpisodeNews } from "@/lib/show/server";
import type { ActionState } from "@/lib/utils";
import { ActionError, runAction, splitList, zOptText } from "@/app/(app)/w/[slug]/_lib/action-utils";

const zDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date");
const windowSchema = z.object({
  sinceDays: z.coerce.number().int().min(1).max(14),
  count: z.coerce.number().int().min(1).max(10),
});

async function loadEpisode(form: FormData): Promise<Episode> {
  const id = z.string().min(1).max(64).parse(form.get("id"));
  const [ep] = await db.select().from(episodes).where(eq(episodes.id, id)).limit(1);
  if (!ep) throw new ActionError("Episode not found.");
  return ep;
}

function revalidateEpisode(ep: Pick<Episode, "id" | "slug" | "status">) {
  revalidatePath("/admin/show");
  revalidatePath(`/admin/show/${ep.id}`);
  revalidatePath("/show");
  revalidatePath(`/show/${ep.slug}`);
}

function readyRundown(ep: Episode): Rundown {
  if (ep.prepStatus === "generating") throw new ActionError("The rundown is still being written. Try again in a moment.");
  return parseRundown(ep.rundown) ?? { cold_open: "", segments: [], closer: "", generator: "manual" };
}

async function saveRundown(ep: Episode, rundown: Rundown) {
  await db
    .update(episodes)
    .set({ rundown: rundown as unknown as Record<string, unknown>, storyIds: storyIdsOf(rundown) })
    .where(eq(episodes.id, ep.id));
  revalidateEpisode(ep);
}

export async function createEpisodeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await requireStaff();
    const v = windowSchema.extend({ airDate: zDate() }).parse({ airDate: form.get("airDate"), sinceDays: form.get("sinceDays"), count: form.get("count") });
    const ep = await createEpisode({ ...v, userId: me.id });
    revalidatePath("/admin/show");
    redirect(`/admin/show/${ep.id}`);
  });
}

export async function refreshNewsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    readyRundown(ep);
    const v = windowSchema.parse({ sinceDays: form.get("sinceDays"), count: form.get("count") });
    await refreshEpisodeNews(ep, v);
    revalidateEpisode(ep);
    return { ok: true, message: "Picking fresh stories and rewriting the news segments…" };
  });
}

const detailsSchema = z.object({
  title: z.string().trim().min(3, "must be at least 3 characters").max(200),
  airDate: zDate(),
  videoUrl: zOptText(500).refine((v) => v == null || /^https:\/\//i.test(v), "must be an https:// link"),
  showNotes: zOptText(10_000),
});

export async function saveEpisodeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    const v = detailsSchema.parse({ title: form.get("title"), airDate: form.get("airDate"), videoUrl: form.get("videoUrl") ?? "", showNotes: form.get("showNotes") ?? "" });
    await db.update(episodes).set(v).where(eq(episodes.id, ep.id));
    revalidateEpisode(ep);
    return { ok: true, message: "Saved." };
  });
}

async function draftNotes(ep: Episode, rundown: Rundown) {
  const list = await episodeStories(ep);
  return showNotesFromRundown(rundown, new Map(list.map((s) => [s.id, s])), appUrl());
}

export async function draftShowNotesAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    const notes = await draftNotes(ep, readyRundown(ep));
    await db.update(episodes).set({ showNotes: notes }).where(eq(episodes.id, ep.id));
    revalidateEpisode(ep);
    return { ok: true, message: "Show notes drafted from the rundown. Edit them before publishing." };
  });
}

export async function setPublishedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    const publish = form.get("publish") === "1";
    if (publish) {
      const rundown = readyRundown(ep);
      if (!rundown.segments.length) throw new ActionError("Add at least one segment before publishing.");
      const showNotes = ep.showNotes?.trim() ? ep.showNotes : await draftNotes(ep, rundown);
      await db.update(episodes).set({ status: "published", showNotes, publishedAt: ep.publishedAt ?? new Date() }).where(eq(episodes.id, ep.id));
    } else {
      await db.update(episodes).set({ status: "draft" }).where(eq(episodes.id, ep.id));
    }
    revalidateEpisode(ep);
    revalidatePath("/sitemap.xml");
    return { ok: true, message: publish ? `Published at /show/${ep.slug}.` : "Unpublished. The public page is gone." };
  });
}

export async function deleteEpisodeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    if (ep.status === "published") throw new ActionError("Unpublish the episode before deleting it.");
    await db.delete(episodes).where(eq(episodes.id, ep.id));
    revalidatePath("/admin/show");
    redirect("/admin/show");
  });
}

/** Move up/down or remove a segment (plain form action: buttons in the rundown). */
export async function editSegmentAction(form: FormData): Promise<void> {
  await requireStaff();
  const ep = await loadEpisode(form);
  const { segmentId, op } = z
    .object({ segmentId: z.string().min(1).max(100), op: z.enum(["up", "down", "remove"]) })
    .parse({ segmentId: form.get("segmentId"), op: form.get("op") });
  if (ep.prepStatus === "generating") return;
  const rundown = parseRundown(ep.rundown);
  if (!rundown) return;
  await saveRundown(ep, editSegments(rundown, segmentId, op));
}

async function addSegment(ep: Episode, seg: Segment) {
  await saveRundown(ep, insertSegment(readyRundown(ep), seg));
}

const buildLiveSchema = z.object({
  title: z.string().trim().min(3, "must be at least 3 characters").max(120),
  problem: z.string().trim().min(10, "needs a sentence or two").max(1500),
  team: zOptText(80),
  stack: z.string().max(500),
  systems: z.string().max(500),
  riskTier: z.enum(["unclassified", "minimal", "limited", "high"]),
});

export async function addBuildLiveAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    readyRundown(ep);
    const v = buildLiveSchema.parse({
      title: form.get("title"),
      problem: form.get("problem"),
      team: form.get("team") ?? "",
      stack: form.get("stack") ?? "",
      systems: form.get("systems") ?? "",
      riskTier: form.get("riskTier") ?? "unclassified",
    });
    const seg = await buildLiveFromIdea({
      ...v,
      stack: splitList(v.stack, 10),
      systems: splitList(v.systems, 6),
      customerFacing: form.get("customerFacing") === "on",
    });
    // Re-read: the brief can take a while and the rundown may have changed meanwhile.
    const [fresh] = await db.select().from(episodes).where(eq(episodes.id, ep.id)).limit(1);
    await addSegment(fresh ?? ep, seg);
    return { ok: true, message: "Build-it-live segment added." };
  });
}

export async function addDataSegmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    readyRundown(ep);
    const insights = await loadInsights();
    if (!insights.eligible) {
      throw new ActionError(
        `Not enough data yet: ${insights.orgCount} opted-in workspace${insights.orgCount === 1 ? " has" : "s have"} initiatives, and at least ${MIN_ORGS} are needed to keep the numbers anonymous.`,
      );
    }
    await addSegment(ep, dataSegment(insights, `data-${crypto.randomUUID().slice(0, 8)}`));
    return { ok: true, message: "By-the-numbers segment added." };
  });
}

const customSchema = z.object({
  title: z.string().trim().min(3, "must be at least 3 characters").max(160),
  minutes: z.coerce.number().int().min(1).max(60),
  points: z.string().trim().min(1, "add at least one talking point").max(4000),
});

export async function addCustomSegmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requireStaff();
    const ep = await loadEpisode(form);
    readyRundown(ep);
    const v = customSchema.parse({ title: form.get("title"), minutes: form.get("minutes"), points: form.get("points") });
    await addSegment(ep, customSegment(v, `custom-${crypto.randomUUID().slice(0, 8)}`));
    return { ok: true, message: "Segment added." };
  });
}
