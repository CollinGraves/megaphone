/**
 * Self-serve workspace creation rules. Pure module: the server action gathers the facts (how many
 * workspaces this person created, whether their company domain already has a workspace) and these
 * functions decide. Unit-tested in workspace-creation.test.ts.
 */
import { slugify } from "@/lib/ingest/heuristics";
import type { EmailKind } from "@/lib/email-domains";

/** A person can create at most this many workspaces themselves (North Labs staff are exempt). */
export const MAX_CREATED_WORKSPACES = 3;

/** First path segments that would be confusing (or collide with app routes) as workspace slugs. */
export const RESERVED_SLUGS = new Set([
  "new", "admin", "api", "settings", "invite", "app", "www", "billing", "pricing", "w", "workspaces", "story", "radar", "intake",
]);

export type ExistingDomainWorkspace = {
  name: string;
  /** Owner's display name and company domain (null if the owner has a personal email). */
  ownerName: string | null;
  ownerDomain: string | null;
};

export type CreationFacts = {
  isStaff: boolean;
  emailKind: EmailKind;
  /** The person's registrable company domain (null for personal email). */
  companyDomain: string | null;
  /** Workspaces this person created themselves. */
  createdCount: number;
  /** An existing workspace that belongs to the person's company domain (any plan). */
  domainWorkspace: ExistingDomainWorkspace | null;
};

export type CreationCheck =
  | { ok: true; nudge: "personal_email" | null }
  | { ok: false; reason: "limit" | "domain_exists" | "email"; message: string };

export function checkWorkspaceCreation(f: CreationFacts): CreationCheck {
  if (f.emailKind === "disposable" || f.emailKind === "invalid") {
    return { ok: false, reason: "email", message: "Use your work email address to create a workspace." };
  }
  // One workspace per company domain, for everyone (staff included): colleagues ask to join instead.
  if (f.companyDomain && f.domainWorkspace) {
    const w = f.domainWorkspace;
    // Only name the owner to colleagues on the same domain.
    const owner = w.ownerName && w.ownerDomain === f.companyDomain ? `Its owner, ${w.ownerName},` : "An admin";
    return {
      ok: false,
      reason: "domain_exists",
      message: `${w.name} already has a workspace for @${f.companyDomain}. Ask to join it so your company keeps one AI portfolio. ${owner} will get your request.`,
    };
  }
  if (f.isStaff) return { ok: true, nudge: null };
  if (f.createdCount >= MAX_CREATED_WORKSPACES) {
    return {
      ok: false,
      reason: "limit",
      message: `You've already created ${MAX_CREATED_WORKSPACES} workspaces, the most one person can create. Ask a colleague to invite you to an existing workspace, or talk to North Labs if you need more.`,
    };
  }
  return { ok: true, nudge: f.emailKind === "work" ? null : "personal_email" };
}

/** Slug candidates for a workspace name: the name itself, then a few suffixed variants. */
export function slugCandidates(name: string, random: () => string = () => Math.random().toString(36).slice(2, 6)): string[] {
  let base = slugify(name, 40);
  if (base.length < 2 || RESERVED_SLUGS.has(base)) base = "ai-workspace";
  return [base, `${base}-ai`, `${base}-2`, `${base}-3`, `${base}-${random()}`, `${base}-${random()}${random()}`];
}
