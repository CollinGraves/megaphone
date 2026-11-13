"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { systemCategory, systems } from "@/db/schema";
import type { ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction, zId, zOptText } from "../_lib/action-utils";
import { getOwnedSystem } from "../_lib/guards";

const systemSchema = z.object({
  name: z.string().trim().min(2, "must be at least 2 characters").max(120),
  category: z.enum(systemCategory.enumValues),
  vendor: zOptText(120),
  owner: zOptText(120),
  description: zOptText(2000),
});

const parseSystem = (form: FormData) =>
  systemSchema.parse({
    name: form.get("name") ?? "",
    category: form.get("category"),
    vendor: form.get("vendor"),
    owner: form.get("owner"),
    description: form.get("description"),
  });

async function assertUniqueName(ctx: WorkspaceContext, name: string, exceptId?: string) {
  const [clash] = await db
    .select({ id: systems.id })
    .from(systems)
    .where(and(eq(systems.orgId, ctx.org.id), eq(systems.name, name), exceptId ? ne(systems.id, exceptId) : undefined))
    .limit(1);
  if (clash) throw new ActionError(`A system named “${name}” already exists.`);
}

export async function createSystem(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "system:write");
    const values = parseSystem(form);
    await assertUniqueName(ctx, values.name);
    await db.insert(systems).values({ ...values, orgId: ctx.org.id });
    await logActivity(ctx, "system.created", { name: values.name });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: `Added ${values.name}.` };
  });
}

export async function updateSystem(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "system:write");
    const system = await getOwnedSystem(ctx, zId().parse(form.get("id")));
    const values = parseSystem(form);
    await assertUniqueName(ctx, values.name, system.id);
    await db.update(systems).set(values).where(and(eq(systems.id, system.id), eq(systems.orgId, ctx.org.id)));
    await logActivity(ctx, "system.updated", { name: values.name });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Saved." };
  });
}

export async function deleteSystem(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "system:write");
    const system = await getOwnedSystem(ctx, zId().parse(form.get("id")));
    // Cascades to the data dependencies that reference it.
    await db.delete(systems).where(and(eq(systems.id, system.id), eq(systems.orgId, ctx.org.id)));
    await logActivity(ctx, "system.deleted", { name: system.name });
    revalidateWorkspace(ctx.org.slug);
    redirect(`/w/${ctx.org.slug}/systems`);
  });
}
