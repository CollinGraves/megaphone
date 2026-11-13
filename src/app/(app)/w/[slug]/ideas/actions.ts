"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { ideas, impactMetrics, initiatives, type Idea } from "@/db/schema";
import { ideaToInitiativeDefaults } from "@/lib/ideas";
import { initiativeCapMessage, initiativeLimit } from "@/lib/plans";
import type { ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction, zId, zOptText } from "../_lib/action-utils";
import { notifySubmitterOfDecision, notifyTriagersOfNewIdea, parseIdeaFields } from "./_lib/server";

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};

/** Tenant guard: the idea must belong to the caller's workspace (a miss reads as "not found"). */
async function getOwnedIdea(ctx: WorkspaceContext, id: string): Promise<Idea> {
  const [row] = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new ActionError("Idea not found.");
  return row;
}

const ideaPath = (ctx: WorkspaceContext, id: string) => `/w/${ctx.org.slug}/ideas/${id}`;

/* ───────────────────────────── Submit (signed-in members) ───────────────────────────── */

export async function submitIdea(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "ideas:submit");
    const values = parseIdeaFields(form);
    const [created] = await db
      .insert(ideas)
      .values({
        ...values,
        orgId: ctx.org.id,
        submitterName: ctx.user.name.slice(0, 120) || ctx.user.email,
        submitterEmail: ctx.user.email.toLowerCase(),
        submittedById: ctx.user.id,
        channel: "workspace",
      })
      .returning();
    await logActivity(ctx, "idea.submitted", { ideaId: created.id, title: created.title, channel: "workspace" });
    await notifyTriagersOfNewIdea(ctx.org, created);
    revalidateWorkspace(ctx.org.slug);
    redirect(`${ideaPath(ctx, created.id)}?submitted=1`);
  });
}

/* ───────────────────────────── Triage ───────────────────────────── */

const notesSchema = zOptText(5000);

/** Move to "under review" (also re-opens a declined/duplicate idea) and save triage notes. */
export async function reviewIdea(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "ideas:triage");
    const idea = await getOwnedIdea(ctx, zId().parse(field(form, "id")));
    if (idea.status === "accepted") throw new ActionError("This idea has already been converted to an initiative.");
    const triageNotes = notesSchema.parse(field(form, "triageNotes"));
    const reopening = idea.status === "declined" || idea.status === "duplicate";
    await db
      .update(ideas)
      .set({
        status: "under_review",
        triageNotes,
        triagedById: ctx.user.id,
        triagedAt: new Date(),
        ...(reopening ? { declineReason: null, duplicateOfId: null, initiativeId: null } : {}),
      })
      .where(and(eq(ideas.id, idea.id), eq(ideas.orgId, ctx.org.id)));
    if (idea.status !== "under_review") {
      await logActivity(ctx, reopening ? "idea.reopened" : "idea.under_review", { ideaId: idea.id, title: idea.title });
    } else if ((idea.triageNotes ?? null) !== triageNotes) {
      await logActivity(ctx, "idea.notes_updated", { ideaId: idea.id, title: idea.title });
    }
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: idea.status === "under_review" ? "Notes saved." : "Moved to under review." };
  });
}

const convertSchema = z.object({
  title: z.string().trim().min(3, "must be at least 3 characters").max(160),
  businessUnit: zOptText(100),
  includeEstimate: z.boolean(),
});

/**
 * Convert an idea into an initiative (stage "idea"), prefilled from the submission, with an
 * hours-saved estimate when the idea has hours data. Respects the trial initiative cap.
 */
export async function convertIdea(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "ideas:triage");
    const idea = await getOwnedIdea(ctx, zId().parse(field(form, "id")));
    if (idea.status === "accepted") throw new ActionError("This idea has already been converted to an initiative.");
    const v = convertSchema.parse({
      title: field(form, "title") ?? idea.title,
      businessUnit: field(form, "businessUnit"),
      includeEstimate: field(form, "includeEstimate") === "1",
    });

    if (initiativeLimit(ctx.org.plan) != null) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(initiatives)
        .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt)));
      const capped = initiativeCapMessage(ctx.org.plan, n);
      if (capped) throw new ActionError(capped);
    }

    const defaults = ideaToInitiativeDefaults(idea);
    const metric = v.includeEstimate ? defaults.metric : null;

    const initiativeId = await db.transaction(async (tx) => {
      // Claim the idea first so two triagers can't convert it twice.
      const claimed = await tx
        .update(ideas)
        .set({ status: "accepted", triagedById: ctx.user.id, triagedAt: new Date(), declineReason: null, duplicateOfId: null })
        .where(and(eq(ideas.id, idea.id), eq(ideas.orgId, ctx.org.id), ne(ideas.status, "accepted")))
        .returning({ id: ideas.id });
      if (claimed.length === 0) throw new ActionError("This idea has already been converted to an initiative.");

      const [created] = await tx
        .insert(initiatives)
        .values({
          ...defaults.initiative,
          title: v.title,
          businessUnit: v.businessUnit,
          orgId: ctx.org.id,
          sourceIdeaId: idea.id,
          createdById: ctx.user.id,
        })
        .returning({ id: initiatives.id });
      if (metric) await tx.insert(impactMetrics).values({ ...metric, initiativeId: created.id });
      await tx.update(ideas).set({ initiativeId: created.id }).where(eq(ideas.id, idea.id));
      return created.id;
    });

    await logActivity(ctx, "initiative.created", { title: v.title, sourceIdeaId: idea.id }, initiativeId);
    if (metric) await logActivity(ctx, "metric.added", { metric: metric.name }, initiativeId);
    await logActivity(ctx, "idea.accepted", { ideaId: idea.id, title: idea.title, initiativeTitle: v.title }, initiativeId);
    notifySubmitterOfDecision(ctx.org, idea, { kind: "accepted", initiativeTitle: v.title });
    revalidateWorkspace(ctx.org.slug);
    redirect(`/w/${ctx.org.slug}/initiatives/${initiativeId}`);
  });
}

const declineSchema = z.object({
  reason: z.string().trim().min(5, "please give the submitter a short reason").max(2000),
  notify: z.boolean(),
});

export async function declineIdea(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "ideas:triage");
    const idea = await getOwnedIdea(ctx, zId().parse(field(form, "id")));
    if (idea.status === "accepted") throw new ActionError("This idea has already been converted to an initiative.");
    const v = declineSchema.parse({ reason: field(form, "reason") ?? "", notify: field(form, "notify") === "1" });
    await db
      .update(ideas)
      .set({ status: "declined", declineReason: v.reason, duplicateOfId: null, initiativeId: null, triagedById: ctx.user.id, triagedAt: new Date() })
      .where(and(eq(ideas.id, idea.id), eq(ideas.orgId, ctx.org.id)));
    await logActivity(ctx, "idea.declined", { ideaId: idea.id, title: idea.title, reason: v.reason, notified: v.notify });
    if (v.notify) notifySubmitterOfDecision(ctx.org, idea, { kind: "declined", reason: v.reason });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: v.notify ? `Declined. ${idea.submitterName} will get an email with your reason.` : "Declined." };
  });
}

/** `target` is "idea:<id>" or "initiative:<id>" — both re-resolved against the caller's workspace. */
const duplicateSchema = z.object({
  target: z.string().regex(/^(idea|initiative):[\w-]{1,100}$/, "pick what it duplicates"),
  notify: z.boolean(),
});

export async function markDuplicate(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "ideas:triage");
    const idea = await getOwnedIdea(ctx, zId().parse(field(form, "id")));
    if (idea.status === "accepted") throw new ActionError("This idea has already been converted to an initiative.");
    const v = duplicateSchema.parse({ target: field(form, "target") ?? "", notify: field(form, "notify") === "1" });
    const [kind, targetId] = v.target.split(":") as ["idea" | "initiative", string];

    let ofTitle: string;
    let set: Partial<typeof ideas.$inferInsert>;
    if (kind === "initiative") {
      const [target] = await db
        .select({ id: initiatives.id, title: initiatives.title })
        .from(initiatives)
        .where(and(eq(initiatives.id, targetId), eq(initiatives.orgId, ctx.org.id)))
        .limit(1);
      if (!target) throw new ActionError("Initiative not found.");
      ofTitle = target.title;
      set = { initiativeId: target.id, duplicateOfId: null };
    } else {
      if (targetId === idea.id) throw new ActionError("An idea can't duplicate itself.");
      const target = await getOwnedIdea(ctx, targetId);
      if (target.duplicateOfId === idea.id) throw new ActionError(`“${target.title}” is already marked as a duplicate of this idea.`);
      ofTitle = target.title;
      // Inherit the original's initiative (if it was converted) so the submitter can follow it.
      set = { duplicateOfId: target.id, initiativeId: target.initiativeId };
    }

    await db
      .update(ideas)
      .set({ ...set, status: "duplicate", declineReason: null, triagedById: ctx.user.id, triagedAt: new Date() })
      .where(and(eq(ideas.id, idea.id), eq(ideas.orgId, ctx.org.id)));
    await logActivity(
      ctx,
      "idea.duplicate",
      { ideaId: idea.id, title: idea.title, of: ofTitle, ofKind: kind, notified: v.notify },
      kind === "initiative" ? targetId : undefined,
    );
    if (v.notify) notifySubmitterOfDecision(ctx.org, idea, { kind: "duplicate", ofTitle, isInitiative: kind === "initiative" });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Marked as a duplicate." };
  });
}
