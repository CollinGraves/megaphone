"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { costConnections, costLines, costMappings, initiatives } from "@/db/schema";
import { PROVIDERS, ProviderError, validateKey, type ApiProviderId } from "@/lib/costs/providers";
import { encryptSecret, hasCostEncryption, secretHint } from "@/lib/costs/secret";
import { syncConnection } from "@/lib/costs/sync";
import { featureGateMessage, hasFeature } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/utils";
import { logActivity, type WorkspaceContext } from "@/lib/workspace";
import { ActionError, authorize, revalidateWorkspace, runAction } from "../_lib/action-utils";

const providerSchema = z.enum(["openai", "anthropic"]);

function requireFeature(ctx: WorkspaceContext) {
  if (!hasFeature(ctx.org.plan, "ai_spend")) throw new ActionError(featureGateMessage(ctx.org.plan, "ai_spend"));
}

async function connectionFor(ctx: WorkspaceContext, form: FormData) {
  const id = String(form.get("connectionId") ?? "");
  const [conn] = await db
    .select()
    .from(costConnections)
    .where(and(eq(costConnections.id, id), eq(costConnections.orgId, ctx.org.id)))
    .limit(1);
  if (!conn) throw new ActionError("That connection no longer exists. Reload the page.");
  return conn;
}

/** Check an admin key with the vendor, store it encrypted, then pull 90 days of costs. */
export async function connectProvider(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    requireFeature(ctx);
    const provider = providerSchema.parse(form.get("provider")) as ApiProviderId;
    const key = String(form.get("key") ?? "").trim();
    const info = PROVIDERS[provider];
    if (!key) throw new ActionError(`Paste your ${info.name} admin key.`);
    if (!key.startsWith(info.keyPrefix)) {
      throw new ActionError(`That doesn't look like an ${info.name} admin key. Admin keys start with "${info.keyPrefix}". A regular API key won't work.`);
    }
    if (!hasCostEncryption()) throw new ActionError("Connections aren't set up on this server yet. Ask North Labs to finish setup.");
    const limit = await rateLimit(`costs:connect:${ctx.user.id}`, 10, 3600);
    if (!limit.allowed) throw new ActionError("Too many tries in the last hour. Please try again later.");

    let label: string;
    try {
      ({ label } = await validateKey(provider, key));
    } catch (err) {
      throw new ActionError(err instanceof ProviderError ? err.message : `Couldn't check the key with ${info.name}. Please try again.`);
    }

    const values = { label, secret: encryptSecret(key), secretHint: secretHint(key), status: "active" as const, lastError: null, updatedAt: new Date() };
    const [conn] = await db
      .insert(costConnections)
      .values({ orgId: ctx.org.id, provider, createdById: ctx.user.id, ...values })
      .onConflictDoUpdate({ target: [costConnections.orgId, costConnections.provider], set: { ...values, lastSyncedAt: null } })
      .returning();
    await logActivity(ctx, "costs.connected", { provider: info.name, account: label });
    const synced = await syncConnection(conn, { days: 90 });
    revalidateWorkspace(ctx.org.slug);
    return synced.ok
      ? { ok: true, message: `Connected ${info.name}. Pulled the last 90 days of spend.` }
      : { error: `Connected ${info.name}, but the first sync failed: ${synced.error}` };
  });
}

export async function syncNow(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    requireFeature(ctx);
    const conn = await connectionFor(ctx, form);
    const limit = await rateLimit(`costs:sync:${conn.id}`, 6, 3600);
    if (!limit.allowed) throw new ActionError("This was synced a lot in the last hour. It also syncs every night.");
    const result = await syncConnection(conn);
    revalidateWorkspace(ctx.org.slug);
    if (!result.ok) throw new ActionError(result.error);
    return { ok: true, message: "Synced." };
  });
}

/** Delete the stored key and every cost line that came from it. */
export async function disconnectProvider(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "settings:manage");
    const conn = await connectionFor(ctx, form);
    await db.delete(costConnections).where(eq(costConnections.id, conn.id)); // cascades lines and matches
    await logActivity(ctx, "costs.disconnected", { provider: PROVIDERS[conn.provider as ApiProviderId]?.name ?? conn.provider });
    revalidateWorkspace(ctx.org.slug);
    return { ok: true, message: "Disconnected. The key and its spend data were deleted." };
  });
}

/** Tie a vendor project/workspace's spend to an AI project, mark it as not a project, or clear it. */
export async function saveCostMatch(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ctx = await authorize(form, "initiative:write");
    requireFeature(ctx);
    const conn = await connectionFor(ctx, form);
    const dimensionKey = z.string().min(1).max(300).parse(form.get("dimensionKey"));
    const [exists] = await db
      .select({ id: costLines.id })
      .from(costLines)
      .where(and(eq(costLines.connectionId, conn.id), eq(costLines.dimensionKey, dimensionKey)))
      .limit(1);
    if (!exists) throw new ActionError("That spend is no longer there. Reload the page.");

    const choice = String(form.get("target") ?? "");
    if (!choice) {
      await db.delete(costMappings).where(and(eq(costMappings.connectionId, conn.id), eq(costMappings.dimensionKey, dimensionKey)));
      revalidateWorkspace(ctx.org.slug);
      return { ok: true };
    }
    let initiativeId: string | null = null;
    let title = "not an AI project";
    if (choice !== "ignore") {
      const [p] = await db
        .select({ id: initiatives.id, title: initiatives.title })
        .from(initiatives)
        .where(and(eq(initiatives.id, choice), eq(initiatives.orgId, ctx.org.id)))
        .limit(1);
      if (!p) throw new ActionError("Pick an AI project from the list.");
      initiativeId = p.id;
      title = p.title;
    }
    const values = { initiativeId, ignored: choice === "ignore", createdById: ctx.user.id, updatedAt: new Date() };
    await db
      .insert(costMappings)
      .values({ orgId: ctx.org.id, connectionId: conn.id, dimensionKey, ...values })
      .onConflictDoUpdate({ target: [costMappings.connectionId, costMappings.dimensionKey], set: values });
    await logActivity(ctx, "costs.matched", { name: String(form.get("dimensionName") ?? dimensionKey).slice(0, 200), to: title }, initiativeId ?? undefined);
    revalidateWorkspace(ctx.org.slug);
    return { ok: true };
  });
}
