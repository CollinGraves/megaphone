"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { sources, sourceType } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { runIngestion, type IngestStats } from "@/lib/ingest/pipeline";
import { CATEGORY_SLUGS, VENDOR_SLUGS } from "@/lib/taxonomy";
import type { ActionState } from "@/lib/utils";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);
const optionalSlug = (allowed: readonly string[], message: string) =>
  optionalText(64).refine((v) => v === null || allowed.includes(v), message);
const httpUrl = z.url({ protocol: /^https?$/, error: "Enter a valid http(s) URL." });

const sourceSchema = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  homepageUrl: z.union([z.literal(""), httpUrl]).transform((v) => v || null),
  feedUrl: httpUrl,
  type: z.enum(sourceType.enumValues),
  pathFilter: optionalText(200),
  vendor: optionalSlug(VENDOR_SLUGS, "Unknown vendor."),
  defaultCategory: optionalSlug(CATEGORY_SLUGS, "Unknown category."),
  authority: z.coerce.number().int().min(1).max(5),
  aiOnly: z.boolean(),
  maxItemsPerFetch: z.coerce.number().int().min(1, "Max items must be at least 1.").max(200, "Max items is capped at 200."),
});

const revalidateSources = () => {
  revalidatePath("/admin/sources");
  revalidatePath("/admin");
};

export async function createSource(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requirePlatformAdmin();
  const parsed = sourceSchema.safeParse({
    name: form.get("name") ?? "",
    homepageUrl: String(form.get("homepageUrl") ?? "").trim(),
    feedUrl: String(form.get("feedUrl") ?? "").trim(),
    type: form.get("type"),
    pathFilter: form.get("pathFilter") ?? "",
    vendor: form.get("vendor") ?? "",
    defaultCategory: form.get("defaultCategory") ?? "",
    authority: form.get("authority"),
    aiOnly: form.get("aiOnly") === "on",
    maxItemsPerFetch: form.get("maxItemsPerFetch") || 25,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const [existing] = await db.select({ id: sources.id }).from(sources).where(eq(sources.feedUrl, parsed.data.feedUrl)).limit(1);
  if (existing) return { error: "A source with this feed URL already exists." };
  await db.insert(sources).values(parsed.data);
  revalidateSources();
  return { ok: true, message: `Added ${parsed.data.name}. Use “Fetch now” to pull it immediately.` };
}

const idSchema = z.string().min(1).max(64);

export async function setSourceActive(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { id, active } = z
    .object({ id: idSchema, active: z.enum(["1", "0"]) })
    .parse({ id: form.get("id"), active: form.get("active") });
  // Re-enabling a source gives it a clean slate on the failure counter.
  await db
    .update(sources)
    .set(active === "1" ? { active: true, consecutiveFailures: 0 } : { active: false })
    .where(eq(sources.id, id));
  revalidateSources();
}

export async function setSourceAuthority(form: FormData): Promise<void> {
  await requirePlatformAdmin();
  const { id, authority } = z
    .object({ id: idSchema, authority: z.coerce.number().int().min(1).max(5) })
    .parse({ id: form.get("id"), authority: form.get("authority") });
  await db.update(sources).set({ authority }).where(eq(sources.id, id));
  revalidateSources();
}

export type RunState = { ok?: boolean; error?: string; stats?: IngestStats; durationMs?: number } | null;

async function run(opts: { sourceIds?: string[] }): Promise<RunState> {
  const started = Date.now();
  try {
    const stats = await runIngestion({ trigger: "manual", ...opts });
    return { ok: true, stats, durationMs: Date.now() - started };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ingestion failed.", durationMs: Date.now() - started };
  } finally {
    revalidateSources();
    revalidatePath("/admin/stories");
    revalidatePath("/radar");
    revalidatePath("/feed");
  }
}

/** Fetch a single source now (also processes any pending articles into stories). */
export async function fetchSourceNow(sourceId: string): Promise<RunState> {
  await requirePlatformAdmin();
  const id = idSchema.parse(sourceId);
  const [source] = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, id)).limit(1);
  if (!source) return { error: "Source not found." };
  return run({ sourceIds: [id] });
}

/** Fetch every active source, then classify and cluster new articles. */
export async function runFullPipeline(): Promise<RunState> {
  await requirePlatformAdmin();
  return run({});
}
