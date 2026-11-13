"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/mcp/keys";
import { listAccessibleWorkspaces } from "@/lib/workspace";

export type CreateKeyState = { error?: string; key?: string; name?: string } | null;

const MAX_ACTIVE_KEYS = 10;

const Schema = z.object({
  name: z.string().trim().min(1, "Give the key a name, e.g. “Claude Desktop”.").max(60),
  orgId: z.string().max(64).optional(),
  access: z.enum(["read", "write"]),
});

export async function createKeyAction(_prev: CreateKeyState, form: FormData): Promise<CreateKeyState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Please sign in again." };
  const parsed = Schema.safeParse({ name: form.get("name"), orgId: form.get("orgId") || undefined, access: form.get("access") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { name, orgId, access } = parsed.data;
  if (orgId) {
    const allowed = await listAccessibleWorkspaces(user);
    if (!allowed.some((w) => w.id === orgId)) return { error: "You don't have access to that workspace." };
  }
  if ((await listApiKeys(user.id)).length >= MAX_ACTIVE_KEYS) return { error: `You can have up to ${MAX_ACTIVE_KEYS} active keys. Revoke one first.` };
  const { key } = await createApiKey({ userId: user.id, orgId: orgId ?? null, name, scopes: access === "write" ? ["read", "write"] : ["read"] });
  revalidatePath("/settings");
  return { key, name };
}

export async function revokeKeyAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  await revokeApiKey(user.id, String(form.get("id") ?? ""));
  revalidatePath("/settings");
}
