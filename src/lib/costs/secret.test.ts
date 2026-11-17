import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mod = await import("./secret");

afterEach(() => vi.unstubAllEnvs());

describe("cost secrets", () => {
  it("round-trips, uses a fresh IV each time, and hides the key", () => {
    vi.stubEnv("COST_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const a = mod.encryptSecret("sk-admin-1234567890abcd");
    const b = mod.encryptSecret("sk-admin-1234567890abcd");
    expect(a).not.toBe(b);
    expect(a).not.toContain("1234567890");
    expect(mod.decryptSecret(a)).toBe("sk-admin-1234567890abcd");
    expect(mod.secretHint("sk-admin-1234567890abcd")).toBe("…abcd");
  });

  it("rejects tampering and a wrong key", () => {
    vi.stubEnv("COST_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    const stored = mod.encryptSecret("secret-value");
    const raw = Buffer.from(stored.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => mod.decryptSecret("v1:" + raw.toString("base64"))).toThrow();
    vi.stubEnv("COST_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    expect(() => mod.decryptSecret(stored)).toThrow();
  });

  it("reports when no usable key is configured", () => {
    vi.stubEnv("COST_ENCRYPTION_KEY", "");
    expect(mod.hasCostEncryption()).toBe(false);
    vi.stubEnv("COST_ENCRYPTION_KEY", Buffer.from("short").toString("base64"));
    expect(mod.hasCostEncryption()).toBe(false);
  });
});
