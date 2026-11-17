import { describe, expect, it } from "vitest";
import { nameSimilarity, suggestMatch } from "./match";

const projects = [
  { id: "1", title: "Invoice exception triage" },
  { id: "2", title: "Sales call summaries & CRM hygiene" },
  { id: "3", title: "Customer service email triage & reply drafting" },
];

describe("suggestMatch", () => {
  it("matches vendor project names to AI projects by meaningful words", () => {
    expect(suggestMatch("invoice-triage-prod", projects)?.id).toBe("1");
    expect(suggestMatch("Sales Calls", projects)?.id).toBe("2");
    expect(suggestMatch("support-email-drafting", projects)?.id).toBe("3");
  });
  it("doesn't guess from noise words or weak overlap", () => {
    expect(suggestMatch("Default workspace", projects)).toBeNull();
    expect(suggestMatch("prod-api", projects)).toBeNull();
    expect(suggestMatch("marketing", projects)).toBeNull();
    expect(nameSimilarity("triage", "Invoice exception triage")).toBe(1);
  });
});
