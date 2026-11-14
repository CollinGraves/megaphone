import { describe, expect, it } from "vitest";
import { canInDepartment, departmentSlug } from "./departments";
import { can } from "./permissions";

const viewer = { role: "viewer", via: "membership" } as const;
const editor = { role: "editor", via: "membership" } as const;
const admin = { role: "admin", via: "membership" } as const;

describe("canInDepartment", () => {
  it("lets a lead approve governance, triage ideas and manage only within their department", () => {
    expect(can(editor, "governance:approve")).toBe(false);
    expect(canInDepartment(editor, "governance:approve", "lead")).toBe(true);
    expect(canInDepartment(viewer, "ideas:triage", "lead")).toBe(true);
    expect(canInDepartment(editor, "departments:manage", "lead")).toBe(true);
    expect(canInDepartment(editor, "governance:approve", "member")).toBe(false);
    expect(canInDepartment(editor, "governance:approve", null)).toBe(false);
  });

  it("never grants more than the lead set, and never without workspace access", () => {
    expect(canInDepartment(viewer, "initiative:delete", "lead")).toBe(false);
    expect(canInDepartment(viewer, "billing:manage", "lead")).toBe(false);
    expect(canInDepartment(null, "ideas:triage", "lead")).toBe(false);
  });

  it("keeps workspace admins' rights everywhere", () => {
    expect(canInDepartment(admin, "governance:approve", null)).toBe(true);
    expect(can(admin, "departments:manage")).toBe(true);
    expect(can(editor, "departments:manage")).toBe(false);
  });
});

describe("departmentSlug", () => {
  it("slugifies and avoids collisions", () => {
    expect(departmentSlug("Finance & Accounting", new Set())).toBe("finance-accounting");
    expect(departmentSlug("Sales", new Set(["sales", "sales-2"]))).toBe("sales-3");
    expect(departmentSlug("!!!", new Set())).toBe("department");
  });
});
