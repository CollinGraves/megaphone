"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { templateById, templateInitiativeValues } from "@/lib/assessment/templates";
import { initiativeCapMessage } from "@/lib/plans";
import type { ActionState } from "@/lib/utils";
import { logActivity } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction, zId } from "../../_lib/action-utils";

/** `upgrade` is set when the plan's initiative cap refused the add (the UI shows a plans link). */
export type AddTemplateState = (NonNullable<ActionState> & { upgrade?: boolean }) | null;

/**
 * Adds a library template to the portfolio as an "idea" initiative. Stays on the library so several
 * templates can be added in a row; the card then links to the new initiative.
 */
export async function addTemplate(_prev: AddTemplateState, form: FormData): Promise<AddTemplateState> {
  let upgrade = false;
  const result = await runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const tpl = templateById(zId().parse(form.get("templateId")));
    if (!tpl) throw new ActionError("Template not found.");

    const [{ active, duplicate, platforms }] = await db
      .select({
        active: sql<number>`(count(*) filter (where ${initiatives.archivedAt} is null))::int`,
        duplicate: sql<boolean>`coalesce(bool_or(${initiatives.archivedAt} is null and lower(${initiatives.title}) = lower(${tpl.title})), false)`,
        // Platforms the workspace already uses, so the new initiative suggests one of them.
        platforms: sql<string[]>`coalesce((select array_agg(distinct p) from initiatives i2, unnest(i2.platforms) as p where i2.org_id = ${ctx.org.id}), '{}')`,
      })
      .from(initiatives)
      .where(eq(initiatives.orgId, ctx.org.id));
    if (duplicate) throw new ActionError(`“${tpl.title}” is already in your portfolio.`);

    // Same plan cap as creating an initiative by hand.
    const capped = initiativeCapMessage(ctx.org.plan, active);
    if (capped) {
      upgrade = true;
      return { error: capped };
    }

    const [created] = await db
      .insert(initiatives)
      .values({ ...templateInitiativeValues(tpl, platforms), orgId: ctx.org.id, createdById: ctx.user.id })
      .returning({ id: initiatives.id });
    await logActivity(ctx, "initiative.created", { title: tpl.title, template: tpl.id }, created.id);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: `Added “${tpl.title}” to the portfolio.` };
  });
  return result && upgrade ? { ...result, upgrade } : result;
}
