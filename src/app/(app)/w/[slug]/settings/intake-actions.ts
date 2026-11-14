"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, user } from "@/db/schema";
import { parseAllowedDomains, workDomainsFrom } from "@/lib/ideas";
import { featureGateMessage, hasFeature } from "@/lib/plans";
import type { ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction } from "../_lib/action-utils";

/** 144 bits, URL-safe. Unguessable; the token is the only thing protecting the public link. */
const newToken = () => randomBytes(18).toString("base64url");

async function memberWorkDomains(ctx: WorkspaceContext) {
  const rows = await db
    .select({ email: user.email })
    .from(memberships)
    .innerJoin(user, eq(memberships.userId, user.id))
    .where(eq(memberships.orgId, ctx.org.id));
  return workDomainsFrom(rows.map((r) => r.email));
}

export async function enableIntakeLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    if (!hasFeature(ctx.org.plan, "intake_link")) throw new ActionError(featureGateMessage(ctx.org.plan, "intake_link"));
    if (ctx.org.intakeToken) return { ok: true, message: "The intake link is already on." };
    // Default the allow-list to the members' company domains rather than "any work email".
    const domains = ctx.org.intakeAllowedDomains.length ? ctx.org.intakeAllowedDomains : await memberWorkDomains(ctx);
    await db.update(organizations).set({ intakeToken: newToken(), intakeAllowedDomains: domains }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "intake.enabled", { domains });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Intake link is on. Copy it and share it with your colleagues." };
  });
}

export async function disableIntakeLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    await db.update(organizations).set({ intakeToken: null }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "intake.disabled");
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Intake link turned off. The old link no longer works." };
  });
}

export async function rotateIntakeLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    if (!hasFeature(ctx.org.plan, "intake_link")) throw new ActionError(featureGateMessage(ctx.org.plan, "intake_link"));
    if (!ctx.org.intakeToken) throw new ActionError("Turn the intake link on first.");
    await db.update(organizations).set({ intakeToken: newToken() }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "intake.rotated");
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "New link created. The previous link no longer works." };
  });
}

export async function saveIntakeDomains(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const raw = form.get("domains");
    if (typeof raw !== "string" || raw.length > 2000) throw new ActionError("Please enter up to 20 domains.");
    const { domains, invalid, rejected } = parseAllowedDomains(raw);
    if (invalid.length) throw new ActionError(`Not a valid domain: ${invalid.slice(0, 3).join(", ")}.`);
    if (rejected.length)
      throw new ActionError(`${rejected.join(", ")} ${rejected.length === 1 ? "is a personal email provider" : "are personal email providers"} — anyone could use ${rejected.length === 1 ? "it" : "them"}. Use your company's domains.`);
    await db.update(organizations).set({ intakeAllowedDomains: domains }).where(eq(organizations.id, ctx.org.id));
    await logActivity(ctx, "intake.domains_updated", { domains });
    revalidateWorkspace(ctx.org.slug);
    return {
      ok: true,
      message: domains.length ? `Saved. Ideas are accepted from ${domains.map((d) => `@${d}`).join(", ")} emails.` : "Saved. Any work email can submit ideas.",
    };
  });
}
