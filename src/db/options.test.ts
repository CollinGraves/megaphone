import { describe, expect, it } from "vitest";
import { clientOptions, isTransactionPooler } from "./options";

const POOLER = "postgres://radar_app.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const DIRECT = "postgres://radar:radar@localhost:5432/ai_radar";

describe("isTransactionPooler", () => {
  it("detects Supabase's pooler by port or host", () => {
    expect(isTransactionPooler(POOLER)).toBe(true);
    expect(isTransactionPooler("postgres://u:p@db.example.com:6543/postgres")).toBe(true);
    expect(isTransactionPooler("postgres://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres")).toBe(true);
    expect(isTransactionPooler(DIRECT)).toBe(false);
    expect(isTransactionPooler("not a url")).toBe(false);
  });
});

describe("clientOptions", () => {
  it("disables pipelining behind the pooler and bounds queries in production", () => {
    const o = clientOptions(POOLER, { NODE_ENV: "production" });
    expect(o).toMatchObject({ prepare: false, max: 5, max_pipeline: 1, query_timeout: 30 });
  });

  it("keeps default pipelining and no query timeout for a local database", () => {
    const o = clientOptions(DIRECT, { NODE_ENV: "development" });
    expect(o).toEqual({ prepare: false, max: 10 });
  });
});
