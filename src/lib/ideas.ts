/**
 * Idea intake & triage helpers. Pure module (no DB, no server-only imports): safe for client
 * components, server actions and tests.
 */
import { classifyEmail, companyDomain, emailDomain } from "./email-domains";

/* ───────────────────────────── Vocabulary ───────────────────────────── */

/** How often the task happens (stored as the slug in `ideas.frequency`). */
export const IDEA_FREQUENCIES = [
  { slug: "many_daily", label: "Several times a day" },
  { slug: "daily", label: "Daily" },
  { slug: "weekly", label: "Weekly" },
  { slug: "monthly", label: "Monthly" },
  { slug: "quarterly", label: "Quarterly or less" },
  { slug: "ad_hoc", label: "Ad hoc / unpredictable" },
] as const;

export const frequencyLabel = (slug: string | null | undefined) =>
  slug ? (IDEA_FREQUENCIES.find((f) => f.slug === slug)?.label ?? slug) : null;

export const IDEA_CHANNELS = [
  { slug: "workspace", label: "In-app" },
  { slug: "intake_link", label: "Intake link" },
] as const;

/* ───────────────────────────── Sizing ───────────────────────────── */

/** Working weeks used to annualize "hours per week". */
export const WEEKS_PER_YEAR = 52;
/** A single person can't plausibly spend more than this on one task per week. */
export const MAX_HOURS_PER_WEEK = 60;
/** Upper bound on people affected (keeps one typo from dominating the triage board). */
export const MAX_PEOPLE_AFFECTED = 100_000;
/**
 * Share of today's time an AI initiative is assumed to save when an idea is converted. Deliberately
 * conservative: the estimate is a starting point the team refines after discovery.
 */
export const DEFAULT_TIME_SAVED_SHARE = 0.5;

export type IdeaSizing = { hoursPerWeek: number | null; peopleAffected: number | null };

const positive = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : null);

/**
 * Hours spent on the task per year today: hours/week (per person) × people × 52.
 * Missing people count is treated as one person (the submitter); missing hours → no estimate.
 * Inputs are clamped to sane ranges.
 */
export function estimateAnnualHours(idea: IdeaSizing): number | null {
  const hours = positive(idea.hoursPerWeek);
  if (hours == null) return null;
  const people = positive(idea.peopleAffected) ?? 1;
  const total = Math.min(hours, MAX_HOURS_PER_WEEK) * Math.min(Math.round(people), MAX_PEOPLE_AFFECTED) * WEEKS_PER_YEAR;
  return Math.round(total);
}

/* ───────────────────────────── Triage signal ───────────────────────────── */

export type IdeaUrgency = "low" | "medium" | "high";
export type IdeaSignal = "high" | "medium" | "low";

export const SIGNAL_LABELS: Record<IdeaSignal, string> = { high: "Strong signal", medium: "Moderate signal", low: "Weak signal" };

/**
 * A quick "look at this first" heuristic for the triage board, from urgency, annual hours and reach.
 * Not a priority score: initiatives get properly scored once converted.
 */
export function ideaSignal(idea: IdeaSizing & { urgency: IdeaUrgency }): { level: IdeaSignal; points: number; reasons: string[] } {
  const reasons: string[] = [];
  let points = 0;

  if (idea.urgency === "high") {
    points += 2;
    reasons.push("marked urgent");
  } else if (idea.urgency === "medium") {
    points += 1;
  }

  const hours = estimateAnnualHours(idea);
  if (hours != null && hours >= 2_000) {
    points += 2;
    reasons.push(`~${hours.toLocaleString("en-US")} hours/yr spent today`);
  } else if (hours != null && hours >= 500) {
    points += 1;
    reasons.push(`~${hours.toLocaleString("en-US")} hours/yr spent today`);
  }

  const people = positive(idea.peopleAffected);
  if (people != null && people >= 50) {
    points += 2;
    reasons.push(`affects ${Math.round(people).toLocaleString("en-US")} people`);
  } else if (people != null && people >= 10) {
    points += 1;
    reasons.push(`affects ${Math.round(people).toLocaleString("en-US")} people`);
  }

  const level: IdeaSignal = points >= 4 ? "high" : points >= 2 ? "medium" : "low";
  return { level, points, reasons };
}

const URGENCY_RANK: Record<IdeaUrgency, number> = { high: 2, medium: 1, low: 0 };
export const urgencyRank = (u: IdeaUrgency) => URGENCY_RANK[u] ?? 0;

/* ───────────────────────────── Intake email validation ───────────────────────────── */

const DOMAIN_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** "@Mail.Acme.com " / "https://acme.com/" → "mail.acme.com"; null if it isn't a domain. */
export function normalizeDomain(input: string): string | null {
  const d = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^[^@\s]*@/, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
  return DOMAIN_RE.test(d) ? d : null;
}

/**
 * Parse a comma/space/newline separated list of domains for the intake allow-list.
 * Domains are reduced to their registrable domain ("eu.acme.com" → "acme.com") because matching is
 * done at that level. Consumer/disposable providers are refused: allowing gmail.com would open the
 * link to the whole internet.
 */
export function parseAllowedDomains(input: string, max = 20): { domains: string[]; invalid: string[]; rejected: string[] } {
  const domains: string[] = [];
  const invalid: string[] = [];
  const rejected: string[] = [];
  for (const raw of input.split(/[\s,;]+/).filter(Boolean)) {
    const d = normalizeDomain(raw);
    if (!d) {
      invalid.push(raw);
      continue;
    }
    const kind = classifyEmail(`x@${d}`);
    if (kind === "personal" || kind === "disposable") {
      rejected.push(d);
      continue;
    }
    const registrable = companyDomain(d);
    if (!domains.includes(registrable)) domains.push(registrable);
  }
  return { domains: domains.slice(0, max), invalid, rejected };
}

export type IntakeEmailResult =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid" | "personal" | "domain"; message: string };

/**
 * Who may submit through the public intake link: anyone whose email's registrable domain matches an
 * allowed domain (subdomains included), or — when no domains are configured — any work email.
 * Disposable addresses are always refused.
 */
export function validateIntakeEmail(rawEmail: string, allowedDomains: readonly string[]): IntakeEmailResult {
  const email = rawEmail.trim().toLowerCase();
  const kind = classifyEmail(email);
  if (kind === "invalid") return { ok: false, reason: "invalid", message: "Please enter a valid email address." };
  if (kind === "disposable") return { ok: false, reason: "personal", message: "Please use your work email address." };

  const allowed = allowedDomains.map((d) => normalizeDomain(d)).filter((d): d is string => Boolean(d)).map(companyDomain);
  if (allowed.length > 0) {
    const domain = companyDomain(emailDomain(email));
    if (allowed.includes(domain)) return { ok: true, email };
    return {
      ok: false,
      reason: kind === "work" ? "domain" : "personal",
      message:
        allowed.length === 1
          ? `Please use your @${allowed[0]} work email.`
          : `Please use your work email (${allowed.map((d) => `@${d}`).join(", ")}).`,
    };
  }
  if (kind !== "work") return { ok: false, reason: "personal", message: "Please use your work email address, not a personal one." };
  return { ok: true, email };
}

/** Distinct registrable work domains from a list of emails (to prefill the allow-list). */
export function workDomainsFrom(emails: readonly string[]): string[] {
  const out = new Set<string>();
  for (const e of emails) if (classifyEmail(e) === "work") out.add(companyDomain(emailDomain(e)));
  return [...out].sort();
}

/* ───────────────────────────── Idea → initiative ───────────────────────────── */

export type IdeaForConversion = IdeaSizing & {
  title: string;
  problem: string;
  desiredOutcome: string | null;
  department: string | null;
  frequency: string | null;
  systemsInvolved: string | null;
  urgency: IdeaUrgency;
  submitterName: string;
};

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/** Prefilled initiative fields (stage "idea") and an optional hours-saved metric estimate. */
export function ideaToInitiativeDefaults(idea: IdeaForConversion) {
  const context: string[] = [];
  if (idea.frequency) context.push(`Frequency: ${frequencyLabel(idea.frequency)}`);
  if (positive(idea.peopleAffected) != null) context.push(`People affected: ${fmt(idea.peopleAffected!)}`);
  if (positive(idea.hoursPerWeek) != null) context.push(`Time spent today: ${fmt(idea.hoursPerWeek!)} h/week per person`);
  if (idea.systemsInvolved) context.push(`Systems involved: ${idea.systemsInvolved}`);
  context.push(`Submitted by ${idea.submitterName}${idea.department ? ` (${idea.department})` : ""}`);

  const problemStatement = [idea.problem.trim(), context.join("\n")].filter(Boolean).join("\n\n").slice(0, 5000);
  const proposedSolution = idea.desiredOutcome?.trim() ? `Desired outcome (from the submitter): ${idea.desiredOutcome.trim()}`.slice(0, 5000) : "";
  const signal = ideaSignal(idea);

  const annualHours = estimateAnnualHours(idea);
  const metric =
    annualHours != null && annualHours > 0
      ? {
          type: "hours_saved" as const,
          name: "Hours saved",
          unit: "hours",
          period: "annual" as const,
          estimatedValue: Math.round(annualHours * DEFAULT_TIME_SAVED_SHARE),
          assumptions:
            `From the idea submission: ${fmt(Math.min(idea.hoursPerWeek!, MAX_HOURS_PER_WEEK))} h/week × ${fmt(positive(idea.peopleAffected) ?? 1)} ` +
            `${positive(idea.peopleAffected) ? "people" : "person (not specified)"} × ${WEEKS_PER_YEAR} weeks ≈ ${fmt(annualHours)} h/yr spent today; ` +
            `assumes AI saves ${Math.round(DEFAULT_TIME_SAVED_SHARE * 100)}% of that. Submitter's estimate — validate during evaluation.`,
        }
      : null;

  return {
    initiative: {
      title: idea.title.trim().slice(0, 160),
      problemStatement,
      proposedSolution,
      businessUnit: idea.department?.trim().slice(0, 100) || null,
      stage: "idea" as const,
      valueScore: signal.level === "high" ? 4 : signal.level === "medium" ? 3 : 2,
      tags: ["from-idea"],
    },
    metric,
    annualHours,
  };
}
