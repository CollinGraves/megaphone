import { describe, expect, it } from "vitest";
import { MAX_CREATED_WORKSPACES, checkWorkspaceCreation, slugCandidates, type CreationFacts } from "./workspace-creation";

const facts = (f: Partial<CreationFacts> = {}): CreationFacts => ({
  isStaff: false,
  emailKind: "work",
  companyDomain: "acme.com",
  createdCount: 0,
  domainFreeWorkspace: null,
  ...f,
});

describe("checkWorkspaceCreation", () => {
  it("allows a first workspace", () => {
    expect(checkWorkspaceCreation(facts())).toEqual({ ok: true, nudge: null });
  });

  it("caps self-created workspaces", () => {
    expect(checkWorkspaceCreation(facts({ createdCount: MAX_CREATED_WORKSPACES - 1 })).ok).toBe(true);
    expect(checkWorkspaceCreation(facts({ createdCount: MAX_CREATED_WORKSPACES }))).toMatchObject({ ok: false, reason: "limit" });
  });

  it("one Free workspace per company domain; names the owner only to same-domain colleagues", () => {
    const sameDomain = checkWorkspaceCreation(facts({ domainFreeWorkspace: { name: "Acme", ownerName: "Olivia Owner", ownerDomain: "acme.com" } }));
    expect(sameDomain).toMatchObject({ ok: false, reason: "domain_exists" });
    expect(!sameDomain.ok && sameDomain.message).toMatch(/Olivia Owner/);

    const otherOwner = checkWorkspaceCreation(facts({ domainFreeWorkspace: { name: "Acme", ownerName: "Pat Personal", ownerDomain: null } }));
    expect(otherOwner).toMatchObject({ ok: false, reason: "domain_exists" });
    expect(!otherOwner.ok && otherOwner.message).not.toMatch(/Pat/);
  });

  it("North Labs staff are exempt from the caps", () => {
    expect(checkWorkspaceCreation(facts({ isStaff: true, createdCount: 10, domainFreeWorkspace: { name: "X", ownerName: "Y", ownerDomain: "acme.com" } }))).toEqual({
      ok: true,
      nudge: null,
    });
  });

  it("personal emails can create one but get a nudge", () => {
    expect(checkWorkspaceCreation(facts({ emailKind: "personal", companyDomain: null }))).toEqual({ ok: true, nudge: "personal_email" });
    // The domain rule doesn't apply without a company domain.
    expect(checkWorkspaceCreation(facts({ emailKind: "personal", companyDomain: null, domainFreeWorkspace: { name: "Gmail co", ownerName: null, ownerDomain: null } })).ok).toBe(true);
    expect(checkWorkspaceCreation(facts({ emailKind: "personal", companyDomain: null, createdCount: MAX_CREATED_WORKSPACES })).ok).toBe(false);
  });

  it("refuses disposable addresses", () => {
    expect(checkWorkspaceCreation(facts({ emailKind: "disposable", companyDomain: null }))).toMatchObject({ ok: false, reason: "email" });
  });
});

describe("slugCandidates", () => {
  const r = () => "zz";
  it("slugifies the name with fallbacks", () => {
    expect(slugCandidates("Acme Corp", r)).toEqual(["acme-corp", "acme-corp-ai", "acme-corp-2", "acme-corp-3", "acme-corp-zz", "acme-corp-zzzz"]);
  });
  it("avoids reserved and empty slugs", () => {
    expect(slugCandidates("Billing", r)[0]).toBe("ai-workspace");
    expect(slugCandidates("!!!", r)[0]).toBe("ai-workspace");
    expect(slugCandidates("A", r)[0]).toBe("ai-workspace");
  });
});
