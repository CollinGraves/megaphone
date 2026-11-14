"use server";

import { eq, sql } from "drizzle-orm";
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
import { cancelJoinRequest, createJoinRequest, JoinRequestError } from "@/lib/join-requests";
import { findDomainWorkspace, loadCreationFacts } from "./data";

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
        .values({
          name: parsed.data.name,
          slug: candidate,
          industry: parsed.data.industry,
          plan: "trial",
          emailDomain: me.companyDomain,
          createdById: me.id,
          provisionedById: null,
        })
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

const joinSchema = z.object({ message: z.string().trim().max(500, "Keep the note under 500 characters.") });

/** Ask to join the workspace that already exists for this person's company domain. */
export async function requestToJoin(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Your session has expired. Please sign in again." };
  const parsed = joinSchema.safeParse({ message: form.get("message") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const limit = await rateLimit(`workspace:join:${me.id}`, 5, 86_400);
  if (!limit.allowed) return { error: "You've sent several requests today. Please wait for an admin to respond." };
  const ws = await findDomainWorkspace(db, me);
  if (!ws) return { error: "We couldn't find a workspace for your company anymore. Try creating one." };
  if (ws.isMember) redirect(`/w/${ws.slug}`);
  try {
    const [org] = await db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, emailDomain: organizations.emailDomain })
      .from(organizations)
      .where(eq(organizations.id, ws.id))
      .limit(1);
    await createJoinRequest(me, org, parsed.data.message || null);
  } catch (err) {
    if (err instanceof JoinRequestError) return { error: err.message };
    throw err;
  }
  revalidatePath("/workspaces/new");
  return { ok: true, message: `Request sent. We'll email you when an admin at ${ws.name} responds.` };
}

export async function cancelJoinRequestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const me = await getCurrentUser();
  if (!me) return { error: "Your session has expired. Please sign in again." };
  const id = z.string().min(1).max(64).safeParse(form.get("requestId"));
  if (!id.success) return { error: "Request not found." };
  await cancelJoinRequest(me.id, id.data);
  revalidatePath("/workspaces/new");
  return { ok: true, message: "Request cancelled." };
}
