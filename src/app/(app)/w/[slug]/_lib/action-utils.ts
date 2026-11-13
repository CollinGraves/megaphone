import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { Capability } from "@/lib/permissions";
import type { ActionState } from "@/lib/utils";
import { ForbiddenError, requireWorkspaceCapability, type WorkspaceContext } from "@/lib/workspace";

/** A user-facing validation/business-rule failure. */
export class ActionError extends Error {}

const slugSchema = z.string().trim().min(1).max(100);

/** Every mutating form carries the workspace slug as a hidden `slug` input. */
export function formSlug(form: FormData): string {
  const parsed = slugSchema.safeParse(form.get("slug"));
  if (!parsed.success) throw new ForbiddenError();
  return parsed.data;
}

/** Resolve the workspace from the form's slug and enforce `capability`. */
export function authorize(form: FormData, capability: Capability): Promise<WorkspaceContext> {
  return requireWorkspaceCapability(formSlug(form), capability);
}

/** Refresh every page under the workspace (layout counts, dashboard, lists, detail pages). */
export function revalidateWorkspace(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

function zodMessage(err: z.ZodError) {
  const issue = err.issues[0];
  if (!issue) return "Please check the form and try again.";
  const field = issue.path.join(".");
  return field ? `${humanize(field)}: ${issue.message}` : issue.message;
}

const humanize = (s: string) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

/**
 * Wrap a server action body for `useActionState`: permission, validation and business errors become
 * `{ error }`; Next.js control-flow errors (redirect / notFound) are re-thrown.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ForbiddenError || err instanceof ActionError) return { error: err.message };
    if (err instanceof z.ZodError) return { error: zodMessage(err) };
    console.error("[workspace action]", err);
    return { error: "Something went wrong. Please try again." };
  }
}

/* ───────────────────────────── Zod helpers for FormData ───────────────────────────── */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const zText = (max = 200) => z.string().trim().max(max);
export const zOptText = (max = 200) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional()).transform((v) => v ?? null);
export const zOptNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z
    .preprocess((v) => {
      const b = blankToNull(v);
      if (b == null) return null;
      return typeof b === "string" ? Number(b.replace(/[$,\s]/g, "")) : b;
    }, z.number({ error: "must be a number" }).min(opts.min ?? -Infinity).max(opts.max ?? Infinity).nullable().optional())
    .refine((v) => v == null || !opts.int || Number.isInteger(v), "must be a whole number")
    .transform((v) => v ?? null);
export const zOptDate = () =>
  z
    .preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date").nullable().optional())
    .transform((v) => v ?? null);
export const zScore = () => z.coerce.number().int().min(1).max(5);
export const zId = () => z.string().trim().min(1).max(100);

/** Comma/newline separated list → unique trimmed strings. */
export const splitList = (v: string | null | undefined, max = 30) =>
  [...new Set((v ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, max);
