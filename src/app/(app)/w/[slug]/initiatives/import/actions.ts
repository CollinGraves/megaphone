"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { impactMetrics, initiatives } from "@/db/schema";
import { enforcedGovernancePolicy } from "@/lib/billing/entitlements";
import { resolveDepartmentField } from "@/lib/departments.server";
import { isoDate, stageChangeBlocked } from "@/lib/governance";
import { MAX_IMPORT_CHARS, MAX_IMPORT_ITEMS } from "@/lib/import/parse";
import { proposeImport, type ProposedItem } from "@/lib/import/server";
import { initiativeLimit } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { STAGES, VENDORS, labelFrom } from "@/lib/taxonomy";
import { logActivity } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction } from "../../_lib/action-utils";

export type ProposeState = { error?: string; items?: ProposedItem[]; generator?: string; fellBack?: boolean } | null;

/** Step 1: read the pasted text into proposed projects (nothing is saved). */
export async function proposeImportAction(_prev: ProposeState, form: FormData): Promise<ProposeState> {
  try {
    const ctx = await authorize(form, "initiative:write");
    const text = String(form.get("text") ?? "").trim();
    if (text.length < 3) return { error: "Paste a list first. Any format works: a spreadsheet, notes or bullets." };
    if (text.length > MAX_IMPORT_CHARS) return { error: `That's a lot of text. Paste up to ${MAX_IMPORT_CHARS.toLocaleString("en-US")} characters at a time.` };
    const limit = await rateLimit(`import:read:${ctx.user.id}`, 20, 3600);
    if (!limit.allowed) return { error: "You've read a lot of lists in the last hour. Please try again a bit later." };
    const existing = await db
      .select({ title: initiatives.title })
      .from(initiatives)
      .where(eq(initiatives.orgId, ctx.org.id));
    const result = await proposeImport(text, existing.map((e) => e.title));
    if (!result.items.length) return { error: "We couldn't find any AI projects in that text. Try one project per line." };
    return result;
  } catch (err) {
    if (err instanceof ActionError) return { error: err.message };
    console.error("[import] read failed", err);
    return { error: "Something went wrong reading your list. Please try again." };
  }
}

const itemSchema = z.object({
  title: z.string().trim().min(3, "each project needs a title of at least 3 characters").max(160),
  problem: z.string().max(5000),
  solution: z.string().max(5000),
  businessUnit: z.string().max(100).nullable(),
  owner: z.string().max(120).nullable(),
  platforms: z.array(z.enum(VENDORS.map((v) => v.slug) as [string, ...string[]])).max(20),
  stage: z.enum(STAGES.map((s) => s.slug) as [string, ...string[]]),
  valueScore: z.number().int().min(1).max(5),
  feasibilityScore: z.number().int().min(1).max(5),
  hoursSavedPerMonth: z.number().positive().max(100_000).nullable(),
});

/** Step 2: create the projects the person kept. */
export async function createImportAction(_prev: { error?: string } | null, form: FormData): Promise<{ error?: string } | null> {
  const state = await runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(form.get("items") ?? "[]"));
    } catch {
      throw new ActionError("Something went wrong with the list. Please read it again.");
    }
    const items = z.array(itemSchema).min(1, "Pick at least one project to add.").max(MAX_IMPORT_ITEMS).parse(parsed);
    let departmentId: string | null | undefined;
    try {
      departmentId = await resolveDepartmentField(ctx.org, form);
    } catch {
      throw new ActionError("Pick a department from the list.");
    }

    // Plan limit (Free and Team plans have a cap on active projects).
    const cap = initiativeLimit(ctx.org.plan);
    if (cap != null) {
      const [{ n }] = await db
        .select({ n: count() })
        .from(initiatives)
        .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt)));
      const room = Math.max(0, cap - n);
      if (items.length > room) {
        throw new ActionError(
          room === 0
            ? `Your plan allows ${cap} active AI projects and you have ${n}. Upgrade in Plan & billing to add more.`
            : `Your plan has room for ${room} more AI project${room === 1 ? "" : "s"}. Untick ${items.length - room}, or upgrade in Plan & billing.`,
        );
      }
    }

    // Same approval rule as creating a project by hand: no skipping straight into a gated stage.
    const policy = enforcedGovernancePolicy(ctx.org);
    const today = isoDate(new Date());
    const gated = items.filter((i) => stageChangeBlocked({ policy, fromStage: null, toStage: i.stage as never, approvalStatus: "not_submitted", reviewDueOn: null, today }));
    if (gated.length) {
      throw new ActionError(
        `Your workspace needs an approval before projects reach ${labelFrom(STAGES, gated[0].stage)}. Set ${gated.length === 1 ? `"${gated[0].title}"` : `${gated.length} projects`} to an earlier stage, then request a review after importing.`,
      );
    }

    const created = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(initiatives)
        .values(
          items.map((i) => ({
            orgId: ctx.org.id,
            title: i.title,
            problemStatement: i.problem,
            proposedSolution: i.solution,
            businessUnit: i.businessUnit,
            ownerName: i.owner,
            platforms: i.platforms,
            stage: i.stage as (typeof initiatives.$inferInsert)["stage"],
            valueScore: i.valueScore,
            feasibilityScore: i.feasibilityScore,
            departmentId: departmentId ?? null,
            createdById: ctx.user.id,
          })),
        )
        .returning({ id: initiatives.id, title: initiatives.title });
      const metrics = items
        .map((i, idx) =>
          i.hoursSavedPerMonth
            ? {
                initiativeId: rows[idx].id,
                type: "hours_saved" as const,
                name: "Hours saved",
                unit: "hours",
                period: "monthly" as const,
                estimatedValue: i.hoursSavedPerMonth,
                assumptions: "From the imported list. Check it when you evaluate the project.",
              }
            : null,
        )
        .filter((m) => m !== null);
      if (metrics.length) await tx.insert(impactMetrics).values(metrics);
      return rows;
    });
    for (const row of created) await logActivity(ctx, "initiative.created", { title: row.title, via: "import" }, row.id);
    revalidateWorkspace(ctx.org.slug);
    redirect(`/w/${ctx.org.slug}/initiatives?imported=${created.length}`);
  });
  return state?.error ? { error: state.error } : null;
}
