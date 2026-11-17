import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Vendor admin keys are encrypted at rest with AES-256-GCM. The 32-byte key lives only in the
 * COST_ENCRYPTION_KEY environment variable (base64), never in the database.
 * Stored format: "v1:" + base64(iv[12] | authTag[16] | ciphertext).
 */
const PREFIX = "v1:";

function key(): Buffer {
  const raw = process.env.COST_ENCRYPTION_KEY;
  if (!raw) throw new Error("COST_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("COST_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  return buf;
}

export function hasCostEncryption(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) throw new Error("Unknown secret format");
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

/** "…a1b2" so people can tell which key is connected without seeing it. */
export const secretHint = (plain: string) => `…${plain.trim().slice(-4)}`;
