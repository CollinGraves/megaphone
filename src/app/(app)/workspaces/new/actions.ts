"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, memberships, organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { INDUSTRY_SLUGS } from "@/lib/taxonomy";
import type { ActionState } from "@/lib/utils";
import { checkWorkspaceCreation, slugCandidates } from "@/lib/workspace-creation";
import { loadCreationFacts } from "./data";

const schema = z.object({
  name: z.string().trim().min(2, "Workspace name: at least 2 characters.").max(120, "Workspace name: 120 characters at most."),
  industry: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(INDUSTRY_SLUGS as [string, ...string[]], { error: "Pick an industry from the list." }).nullable()),
});

/** Self-serve: create a Free workspace owned by the signed-in user, then open it. */
export async function createWorkspace(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Your session has expired. Please sign in again." };
  const parsed = schema.safeParse({ name: form.get("name") ?? "", industry: form.get("industry") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const limit = await rateLimit(`workspace:create:${me.id}`, 10, 3600);
  if (!limit.allowed) return { error: "You’ve tried to create several workspaces in a short time. Please wait a while and try again." };

  const result = await db.transaction(async (tx) => {
    // Serialize creations per person and per company domain so the guardrails can't be raced.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ws-create:user:${me.id}`}))`);
    if (me.companyDomain) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`ws-create:domain:${me.companyDomain}`}))`);

    const facts = await loadCreationFacts(tx, me);
    const check = checkWorkspaceCreation(facts);
    if (!check.ok) return { error: check.message } as const;

    let org: { id: string; slug: string } | undefined;
    for (const candidate of slugCandidates(parsed.data.name)) {
      [org] = await tx
        .insert(organizations)
        .values({ name: parsed.data.name, slug: candidate, industry: parsed.data.industry, plan: "trial", createdById: me.id, provisionedById: null })
        .onConflictDoNothing({ target: organizations.slug })
        .returning({ id: organizations.id, slug: organizations.slug });
      if (org) break;
    }
    if (!org) throw new Error("Could not allocate a workspace slug");
    await tx.insert(memberships).values({ orgId: org.id, userId: me.id, role: "owner" });
    await tx.insert(activityLog).values({
      orgId: org.id,
      userId: me.id,
      action: "workspace.created",
      detail: { name: parsed.data.name, plan: "trial", via: "self_serve", personalEmail: check.nudge === "personal_email" },
    });
    return { slug: org.slug } as const;
  });

  if ("error" in result) return { error: result.error };
  revalidatePath("/", "layout");
  redirect(`/w/${result.slug}`);
}
