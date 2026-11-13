import { describe, expect, it } from "vitest";
import { CAPABILITIES, can, canAssignRole, isStaff, resolveWorkspaceAccess } from "./permissions";

describe("resolveWorkspaceAccess", () => {
  it("denies users with no membership, assignment or admin role", () => {
    expect(resolveWorkspaceAccess({ platformRole: "user", membershipRole: null, isAssignedConsultant: false })).toBeNull();
  });

  it("does not grant unassigned consultants access", () => {
    expect(resolveWorkspaceAccess({ platformRole: "consultant", membershipRole: null, isAssignedConsultant: false })).toBeNull();
  });

  it("grants assigned consultants admin access", () => {
    expect(resolveWorkspaceAccess({ platformRole: "consultant", membershipRole: null, isAssignedConsultant: true })).toEqual({
      role: "admin",
      via: "consultant",
    });
  });

  it("grants platform admins owner access everywhere", () => {
    expect(resolveWorkspaceAccess({ platformRole: "admin", membershipRole: null, isAssignedConsultant: false })).toEqual({
      role: "owner",
      via: "platform_admin",
    });
  });

  it("uses the membership role for regular users", () => {
    expect(resolveWorkspaceAccess({ platformRole: "user", membershipRole: "editor", isAssignedConsultant: false })).toEqual({
      role: "editor",
      via: "membership",
    });
  });

  it("picks the strongest of several grants", () => {
    expect(resolveWorkspaceAccess({ platformRole: "consultant", membershipRole: "viewer", isAssignedConsultant: true })).toEqual({
      role: "admin",
      via: "consultant",
    });
    expect(resolveWorkspaceAccess({ platformRole: "consultant", membershipRole: "owner", isAssignedConsultant: true })).toEqual({
      role: "owner",
      via: "membership",
    });
  });

  it("ignores isAssignedConsultant for non-consultants", () => {
    expect(resolveWorkspaceAccess({ platformRole: "user", membershipRole: null, isAssignedConsultant: true })).toBeNull();
  });
});

describe("can", () => {
  const as = (role: "owner" | "admin" | "editor" | "viewer") => ({ role, via: "membership" as const });

  it("denies everything without access", () => {
    for (const cap of CAPABILITIES) {
      expect(can(null, cap)).toBe(false);
      expect(can(undefined, cap)).toBe(false);
    }
  });

  it("gives owners every capability", () => {
    for (const cap of CAPABILITIES) expect(can(as("owner"), cap)).toBe(true);
  });

  it("keeps viewers read-only (plus comments and export)", () => {
    expect(can(as("viewer"), "workspace:view")).toBe(true);
    expect(can(as("viewer"), "comment:write")).toBe(true);
    expect(can(as("viewer"), "export")).toBe(true);
    for (const cap of ["initiative:write", "initiative:delete", "system:write", "impact:write", "members:manage", "settings:manage"] as const) {
      expect(can(as("viewer"), cap)).toBe(false);
    }
  });

  it("lets editors edit content but not delete, manage members or settings", () => {
    expect(can(as("editor"), "initiative:write")).toBe(true);
    expect(can(as("editor"), "system:write")).toBe(true);
    expect(can(as("editor"), "impact:write")).toBe(true);
    expect(can(as("editor"), "initiative:delete")).toBe(false);
    expect(can(as("editor"), "members:manage")).toBe(false);
    expect(can(as("editor"), "settings:manage")).toBe(false);
  });

  it("lets admins manage members and settings", () => {
    expect(can(as("admin"), "initiative:delete")).toBe(true);
    expect(can(as("admin"), "members:manage")).toBe(true);
    expect(can(as("admin"), "settings:manage")).toBe(true);
  });

  it("is monotonic: each role has at least the capabilities of the role below it", () => {
    const order = ["viewer", "editor", "admin", "owner"] as const;
    for (let i = 1; i < order.length; i++) {
      for (const cap of CAPABILITIES) {
        if (can(as(order[i - 1]), cap)) expect(can(as(order[i]), cap)).toBe(true);
      }
    }
  });
});

describe("canAssignRole", () => {
  it("only lets owners assign or remove owners", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("admin", "owner")).toBe(false);
  });

  it("lets admins manage roles up to admin", () => {
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("admin", "editor")).toBe(true);
    expect(canAssignRole("admin", "viewer")).toBe(true);
  });

  it("denies roles without members:manage", () => {
    for (const target of ["owner", "admin", "editor", "viewer"] as const) {
      expect(canAssignRole("editor", target)).toBe(false);
      expect(canAssignRole("viewer", target)).toBe(false);
    }
  });
});

describe("isStaff", () => {
  it("recognizes North Labs staff", () => {
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("consultant")).toBe(true);
    expect(isStaff("user")).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});
