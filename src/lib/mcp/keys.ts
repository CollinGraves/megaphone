import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, organizations } from "@/db/schema";

export const KEY_PREFIX = "radar_";
export type KeyScope = "read" | "write";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Create a key. The plaintext is returned once and never stored. */
export async function createApiKey(opts: { userId: string; orgId: string | null; name: string; scopes: KeyScope[] }) {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: opts.userId,
      orgId: opts.orgId,
      name: opts.name,
      prefix: key.slice(0, KEY_PREFIX.length + 6),
      keyHash: hashKey(key),
      scopes: [...new Set<KeyScope>(["read", ...opts.scopes])],
    })
    .returning();
  return { key, row };
}

export async function listApiKeys(userId: string) {
  return db
    .select({ key: apiKeys, orgName: organizations.name, orgSlug: organizations.slug })
    .from(apiKeys)
    .leftJoin(organizations, eq(organizations.id, apiKeys.orgId))
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(userId: string, keyId: string) {
  const rows = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

/** Look up an active key by its plaintext. Touches lastUsedAt at most every 5 minutes. */
export async function verifyApiKey(key: string | undefined | null) {
  if (!key || !key.startsWith(KEY_PREFIX) || key.length > 200) return null;
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  const stale = new Date(Date.now() - 5 * 60 * 1000);
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(apiKeys.id, row.id), or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, stale))));
  return row;
}
