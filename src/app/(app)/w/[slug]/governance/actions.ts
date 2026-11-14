"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { humanOversight, initiatives, riskTier, type Initiative } from "@/db/schema";
import {
  canDecide,
  canRequestReview,
  computeReviewDue,
  decisionReopenedBy,
  isoDate,
  materialChanges,
  maxSensitivity,
  normalizePolicy,
  suggestRiskTier,
  yesNo,
} from "@/lib/governance";
import { featureGateMessage, hasFeature } from "@/lib/plans";
import { HUMAN_OVERSIGHT_LEVELS, RISK_TIERS, labelFrom } from "@/lib/taxonomy";
import { formatDate, type ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction, zId, zOptText } from "../_lib/action-utils";
import { getOwnedInitiative } from "../_lib/guards";
import { loadDependencySensitivities } from "./data";
import { notifyDecision, notifyReviewRequested } from "./notify";

/** Review requests and approvals are a Business feature; classification stays available on every plan. */
function requireGovernanceWorkflow(ctx: WorkspaceContext) {
  if (!hasFeature(ctx.org.plan, "governance_workflow")) throw new ActionError(featureGateMessage(ctx.org.plan, "governance_workflow"));
}

const field = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};

const triState = () =>
  z
    .enum(["yes", "no", ""], { error: "pick yes, no or not answered" })
    .optional()
    .transform((v) => (v === "yes" ? true : v === "no" ? false : null));

const classificationSchema = z.object({
  riskTier: z.enum(riskTier.enumValues),
  customerFacing: triState(),
  affectsIndividuals: triState(),
  humanOversight: z.preprocess((v) => (v === "" || v == null ? null : v), z.enum(humanOversight.enumValues).nullable()),
  governanceNotes: zOptText(5000),
});

type Classification = z.infer<typeof classificationSchema>;

const FIELD_LABEL: Record<string, (v: unknown) => string> = {
  riskTier: (v) => `risk tier: ${labelFrom(RISK_TIERS, v as string)}`,
  customerFacing: (v) => `customer-facing: ${yesNo(v as boolean | null).toLowerCase()}`,
  affectsIndividuals: (v) => `affects individuals: ${yesNo(v as boolean | null).toLowerCase()}`,
  humanOversight: (v) => `oversight: ${v ? labelFrom(HUMAN_OVERSIGHT_LEVELS, v as string).toLowerCase() : "not recorded"}`,
};

/**
 * Save classification fields. A material change (tier, audience, individual impact, oversight) after
 * a decision resets the approval to "not submitted" so it has to be reviewed again.
 */
async function applyClassification(ctx: WorkspaceContext, initiative: Initiative, values: Classification): Promise<ActionState> {
  const changed = materialChanges(initiative, values);
  const notesChanged = (initiative.governanceNotes ?? null) !== values.governanceNotes;
  if (changed.length === 0 && !notesChanged) return { ok: true, message: "No changes to save." };

  const reopen = decisionReopenedBy(initiative.approvalStatus, changed);
  const [updated] = await db
    .update(initiatives)
    .set({ ...values, ...(reopen ? { approvalStatus: "not_submitted" as const, reviewDueOn: null } : {}) })
    // Guard against a concurrent decision: only reopen the status we looked at.
    .where(and(eq(initiatives.id, initiative.id), eq(initiatives.orgId, ctx.org.id), eq(initiatives.approvalStatus, initiative.approvalStatus)))
    .returning({ id: initiatives.id });
  if (!updated) throw new ActionError("This initiative’s review status just changed. Reload the page and try again.");

  const changes = changed.map((k) => FIELD_LABEL[k](values[k]));
  if (notesChanged) changes.push("notes");
  await logActivity(ctx, "governance.classified", { title: initiative.title, changes, tier: values.riskTier }, initiative.id);
  if (reopen) {
    await logActivity(
      ctx,
      "governance.reopened",
      { title: initiative.title, previousStatus: initiative.approvalStatus, reason: `classification changed (${changed.map((k) => FIELD_LABEL[k](values[k]).split(":")[0]).join(", ")})` },
      initiative.id,
    );
  }
  revalidateWorkspace(ctx.org.slug);
  return {
    ok: true,
    message: reopen ? "Classification saved. The previous decision no longer applies — request a new review." : "Classification saved.",
  };
}

export async function saveClassification(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "initiativeId")));
    const values = classificationSchema.parse({
      riskTier: field(form, "riskTier"),
      customerFacing: field(form, "customerFacing") ?? "",
      affectsIndividuals: field(form, "affectsIndividuals") ?? "",
      humanOversight: field(form, "humanOversight") ?? "",
      governanceNotes: field(form, "governanceNotes"),
    });
    return applyClassification(ctx, initiative, values);
  });
}

/** Set the tier to the suggestion, recomputed server-side from the stored answers and data dependencies. */
export async function applySuggestedTier(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "initiativeId")));
    const deps = await loadDependencySensitivities(ctx.org.id, initiative.id);
    const suggestion = suggestRiskTier({ ...initiative, maxSensitivity: maxSensitivity(deps.map((d) => d.sensitivity)) });
    if (suggestion.tier === "unclassified") throw new ActionError(suggestion.explanation);
    return applyClassification(ctx, initiative, {
      riskTier: suggestion.tier,
      customerFacing: initiative.customerFacing,
      affectsIndividuals: initiative.affectsIndividuals,
      humanOversight: initiative.humanOversight,
      governanceNotes: initiative.governanceNotes,
    });
  });
}

export async function requestReview(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    requireGovernanceWorkflow(ctx);
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "initiativeId")));
    const note = zOptText(2000).parse(field(form, "note"));
    const today = isoDate(new Date());

    if (initiative.archivedAt) throw new ActionError("Restore the initiative before requesting a review.");
    if (!canRequestReview(initiative, today)) {
      throw new ActionError(
        initiative.approvalStatus === "pending"
          ? "A review is already pending."
          : "This initiative’s approval is current. A re-review can be requested within 30 days of its review date.",
      );
    }
    const missing = [
      initiative.riskTier === "unclassified" && "a risk tier",
      initiative.customerFacing == null && "whether it is customer-facing",
      initiative.affectsIndividuals == null && "whether it affects individuals",
      initiative.humanOversight == null && "the human oversight level",
    ].filter((x): x is string => Boolean(x));
    if (missing.length) throw new ActionError(`Complete the classification before requesting a review: ${missing.join(", ")}.`);

    const now = new Date();
    const [updated] = await db
      .update(initiatives)
      .set({
        approvalStatus: "pending",
        approvalRequestedAt: now,
        approvalRequestedById: ctx.user.id,
        approvalDecidedAt: null,
        approvalDecidedById: null,
        approvalConditions: null,
        reviewDueOn: null,
      })
      .where(and(eq(initiatives.id, initiative.id), eq(initiatives.orgId, ctx.org.id), eq(initiatives.approvalStatus, initiative.approvalStatus)))
      .returning();
    if (!updated) throw new ActionError("This initiative’s review status just changed. Reload the page and try again.");

    const deps = await loadDependencySensitivities(ctx.org.id, initiative.id);
    await logActivity(
      ctx,
      "governance.review_requested",
      { title: initiative.title, tier: initiative.riskTier, previousStatus: initiative.approvalStatus, note },
      initiative.id,
    );
    await notifyReviewRequested(ctx, updated, { maxSensitivity: maxSensitivity(deps.map((d) => d.sensitivity)), note });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Review requested. Owners and admins have been notified." };
  });
}

const decisionSchema = z.object({
  decision: z.enum(["approved", "conditional", "rejected"], { error: "choose a decision" }),
  note: zOptText(2000),
});

export async function decideReview(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "governance:approve");
    requireGovernanceWorkflow(ctx);
    const initiative = await getOwnedInitiative(ctx, zId().parse(field(form, "initiativeId")));
    const { decision, note } = decisionSchema.parse({ decision: field(form, "decision"), note: field(form, "note") });

    if (!canDecide(initiative.approvalStatus)) throw new ActionError("There’s no review to decide. An editor needs to request one first.");
    if (decision === "conditional" && !note) throw new ActionError("Conditions: describe the conditions of this approval.");
    if (decision === "rejected" && !note) throw new ActionError("Reason: explain why this isn’t approved, so the team knows what to change.");
    if (decision !== "rejected" && initiative.riskTier === "unclassified") throw new ActionError("Set a risk tier before approving.");

    const now = new Date();
    const policy = normalizePolicy(ctx.org.governancePolicy);
    const reviewDueOn = decision === "rejected" ? null : computeReviewDue(now, policy.reviewIntervalMonths);
    const renewal = initiative.approvalStatus !== "pending";
    const [updated] = await db
      .update(initiatives)
      .set({ approvalStatus: decision, approvalDecidedAt: now, approvalDecidedById: ctx.user.id, approvalConditions: note, reviewDueOn })
      .where(and(eq(initiatives.id, initiative.id), eq(initiatives.orgId, ctx.org.id), eq(initiatives.approvalStatus, initiative.approvalStatus)))
      .returning();
    if (!updated) throw new ActionError("This initiative’s review status just changed. Reload the page and try again.");

    const action = decision === "approved" ? "governance.approved" : decision === "conditional" ? "governance.approved_with_conditions" : "governance.rejected";
    await logActivity(
      ctx,
      action,
      {
        title: initiative.title,
        tier: initiative.riskTier,
        note,
        reviewDueOn,
        renewal,
        selfApproved: initiative.approvalRequestedById === ctx.user.id,
      },
      initiative.id,
    );
    await notifyDecision(ctx, updated, { requesterId: initiative.approvalRequestedById, decision, note, reviewDueOn });
    revalidateWorkspace(ctx.org.slug);
    return {
      ok: true,
      message: decision === "rejected" ? "Recorded: not approved." : `Decision recorded. Next review due ${formatDate(reviewDueOn)}.`,
    };
  });
}
