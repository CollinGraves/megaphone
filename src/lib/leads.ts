import { aliasedTable, and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contactRequests,
  engagementEvents,
  leadProfiles,
  leadStatus,
  memberships,
  stories,
  user,
  userPreferences,
} from "@/db/schema";
import { COMPANY_SIZES, industryLabel } from "@/lib/taxonomy";

/* ───────────────────────────── Scoring model ─────────────────────────────
 * A lead score (0–100) is the capped sum of seven explainable components:
 *
 *   Profile completeness  ≤ 20   company, title, industry, size, onboarded, interests, digest
 *   Work email               5   non-freemail domain
 *   Company size          ≤ 15   1–50 → 2 … 5,001+ → 15
 *   Seniority             ≤ 15   C-level/founder 15, VP/Head 12, Director 9, Manager/Lead 5
 *   Engagement            ≤ 25   weighted events; last 30 days count fully, older at 25%
 *   Recency               ≤ 10   days since last engagement or contact request
 *   Contact request         20   submitted "Talk to North Labs"
 *   Workspace member        10   already inside a client workspace
 *
 * The raw maximum is 120, so strong intent (a contact request from a senior buyer at a large
 * company) saturates at 100 without needing every other signal.
 */

export const LEAD_STATUSES = leadStatus.enumValues;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ENGAGEMENT_TYPES = ["story_view", "story_click", "digest_open", "digest_click", "cta_click"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const ENGAGEMENT_LABELS: Record<string, string> = {
  signup: "Signed up",
  contact_request: "Submitted contact form",
  onboarded: "Completed onboarding",
  story_view: "Viewed story",
  story_click: "Clicked through to source",
  digest_open: "Opened digest",
  digest_click: "Clicked digest link",
  cta_click: "Clicked North Labs CTA",
};

const ENGAGEMENT_WEIGHTS: Record<EngagementType, number> = {
  story_view: 1,
  story_click: 2,
  digest_open: 1,
  digest_click: 3,
  cta_click: 6,
};
const ENGAGEMENT_NOUNS: Record<EngagementType, [string, string]> = {
  story_view: ["story view", "story views"],
  story_click: ["story click", "story clicks"],
  digest_open: ["digest open", "digest opens"],
  digest_click: ["digest click", "digest clicks"],
  cta_click: ["CTA click", "CTA clicks"],
};

export const RECENT_WINDOW_DAYS = 30;
const OLDER_EVENT_FACTOR = 0.25;
/** Maximum points per score component (raw total 120, capped at 100). */
export const SCORE_MAX_POINTS = {
  profile: 20,
  workEmail: 5,
  size: 15,
  seniority: 15,
  engagement: 25,
  recency: 10,
  contact: 20,
  workspace: 10,
} as const satisfies Record<string, number>;
const MAX = SCORE_MAX_POINTS;

const COMPANY_SIZE_POINTS: Record<(typeof COMPANY_SIZES)[number], number> = {
  "1–50": 2,
  "51–200": 5,
  "201–1,000": 9,
  "1,001–5,000": 12,
  "5,001+": 15,
};

export type Seniority = "c_level" | "vp" | "director" | "manager" | "individual" | "unknown";

const SENIORITY_RULES: { level: Exclude<Seniority, "individual" | "unknown">; label: string; points: number; pattern: RegExp }[] = [
  {
    level: "c_level",
    label: "C-level / founder",
    points: 15,
    pattern: /\b(chief|ceo|cto|cio|cfo|coo|cmo|cdo|cao|caio|ciso|cpo|cro|co-?founder|founder|(?<!vice[\s-])president|managing partner|general partner)\b/i,
  },
  { level: "vp", label: "VP / Head of", points: 12, pattern: /\b(vp|svp|evp|avp|vice[\s-]president|head|managing director)\b/i },
  { level: "director", label: "Director", points: 9, pattern: /\b(director|general manager|gm)\b/i },
  { level: "manager", label: "Manager / lead", points: 5, pattern: /\b(manager|lead|principal|architect|supervisor)\b/i },
];

export const SENIORITY_LABELS: Record<Seniority, string> = {
  c_level: "C-level / founder",
  vp: "VP / Head of",
  director: "Director",
  manager: "Manager / lead",
  individual: "Individual contributor",
  unknown: "Unknown",
};

export function detectSeniority(jobTitle: string | null | undefined): { level: Seniority; points: number } {
  const title = jobTitle?.trim();
  if (!title) return { level: "unknown", points: 0 };
  for (const rule of SENIORITY_RULES) if (rule.pattern.test(title)) return { level: rule.level, points: rule.points };
  return { level: "individual", points: 0 };
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "proton.me",
  "protonmail.com", "gmx.com", "gmx.de", "mail.com", "zoho.com", "yandex.com", "qq.com", "163.com", "hey.com",
  "fastmail.com", "pm.me",
]);

export const emailDomain = (email: string) => email.split("@")[1]?.trim().toLowerCase() ?? "";
export const isWorkEmail = (email: string) => {
  const domain = emailDomain(email);
  return domain.includes(".") && !FREE_EMAIL_DOMAINS.has(domain);
};

export type EngagementCounts = Record<EngagementType, { recent: number; total: number }>;

export const emptyEngagement = (): EngagementCounts =>
  Object.fromEntries(ENGAGEMENT_TYPES.map((t) => [t, { recent: 0, total: 0 }])) as EngagementCounts;

export type LeadSignals = {
  email: string;
  company: string | null;
  jobTitle: string | null;
  industry: string | null;
  companySize: string | null;
  onboarded: boolean;
  /** Number of categories + vendors + industries the lead follows. */
  interestCount: number;
  digestSubscribed: boolean;
  engagement: EngagementCounts;
  /** Most recent scored engagement event (views, clicks, opens…), excluding signup/onboarding. */
  lastEngagedAt: Date | null;
  contactRequests: number;
  lastContactRequestAt: Date | null;
  workspaceCount: number;
};

export type ScoreComponent = keyof typeof SCORE_MAX_POINTS;
export type ScoreReason = { component: ScoreComponent; label: string; points: number };
export type LeadTier = "hot" | "warm" | "cold";
export type LeadScore = { score: number; tier: LeadTier; seniority: Seniority; reasons: ScoreReason[] };

export const tierFor = (score: number): LeadTier => (score >= 70 ? "hot" : score >= 40 ? "warm" : "cold");

const DAY_MS = 24 * 60 * 60 * 1000;
const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

function recencyPoints(daysAgo: number): number {
  if (daysAgo <= 3) return 10;
  if (daysAgo <= 7) return 8;
  if (daysAgo <= 14) return 5;
  if (daysAgo <= 30) return 3;
  if (daysAgo <= 90) return 1;
  return 0;
}

/** Pure, deterministic lead score. `now` is injectable for tests. */
export function scoreLead(s: LeadSignals, now: Date = new Date()): LeadScore {
  const reasons: ScoreReason[] = [];
  const add = (component: ScoreComponent, label: string, points: number) => {
    if (points > 0) reasons.push({ component, label, points: Math.round(points) });
  };

  // Profile completeness
  const profileParts: [boolean, number, string][] = [
    [Boolean(s.company?.trim()), 3, "company"],
    [Boolean(s.jobTitle?.trim()), 3, "title"],
    [Boolean(s.industry), 3, "industry"],
    [Boolean(s.companySize), 3, "size"],
    [s.onboarded, 3, "onboarded"],
    [s.interestCount > 0, 3, "interests"],
    [s.digestSubscribed, 2, "digest"],
  ];
  const present = profileParts.filter(([ok]) => ok);
  const profilePoints = Math.min(MAX.profile, present.reduce((sum, [, pts]) => sum + pts, 0));
  if (profilePoints > 0) {
    add(
      "profile",
      present.length === profileParts.length ? "Complete profile" : `Profile: ${present.map(([, , l]) => l).join(", ")}`,
      profilePoints,
    );
  }

  if (isWorkEmail(s.email)) add("workEmail", `Work email (${emailDomain(s.email)})`, MAX.workEmail);

  const sizePoints = s.companySize ? (COMPANY_SIZE_POINTS[s.companySize as keyof typeof COMPANY_SIZE_POINTS] ?? 0) : 0;
  add("size", `Company size ${s.companySize} employees`, sizePoints);

  const seniority = detectSeniority(s.jobTitle);
  add("seniority", `Seniority: ${SENIORITY_LABELS[seniority.level]}`, seniority.points);

  // Engagement: recent events count fully, older ones are discounted.
  let raw = 0;
  const parts: { type: EngagementType; weighted: number; recent: number }[] = [];
  for (const type of ENGAGEMENT_TYPES) {
    const { recent, total } = s.engagement[type];
    const older = Math.max(0, total - recent);
    const weighted = ENGAGEMENT_WEIGHTS[type] * (recent + OLDER_EVENT_FACTOR * older);
    raw += weighted;
    if (weighted > 0) parts.push({ type, weighted, recent: recent || total });
  }
  const engagementPoints = Math.min(MAX.engagement, Math.round(raw));
  if (engagementPoints > 0) {
    const top = parts
      .sort((a, b) => b.weighted - a.weighted)
      .slice(0, 3)
      .map((p) => plural(p.recent, ENGAGEMENT_NOUNS[p.type]));
    add("engagement", `Engagement: ${top.join(", ")}`, engagementPoints);
  }

  const lastTouch = [s.lastEngagedAt, s.lastContactRequestAt]
    .filter((d): d is Date => d instanceof Date)
    .reduce<Date | null>((a, b) => (!a || b > a ? b : a), null);
  if (lastTouch) {
    const days = Math.max(0, (now.getTime() - lastTouch.getTime()) / DAY_MS);
    const pts = recencyPoints(days);
    add("recency", days < 1 ? "Active in the last day" : `Last active ${Math.floor(days)}d ago`, pts);
  }

  if (s.contactRequests > 0) add("contact", "Asked to talk to North Labs", MAX.contact);
  if (s.workspaceCount > 0)
    add("workspace", `Member of ${plural(s.workspaceCount, ["client workspace", "client workspaces"])}`, MAX.workspace);

  const score = Math.max(0, Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0)));
  reasons.sort((a, b) => b.points - a.points);
  return { score, tier: tierFor(score), seniority: seniority.level, reasons };
}

/* ───────────────────────────── Queries ───────────────────────────── */

export const LEAD_SORTS = ["score", "activity", "signup", "name", "company"] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export type LeadFilters = {
  status?: LeadStatus;
  industry?: string;
  minScore?: number;
  search?: string;
  /** A staff user id, or "none" for unassigned leads. */
  owner?: string;
  sort?: LeadSort;
  dir?: "asc" | "desc";
};

export type LeadRow = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  jobTitle: string | null;
  industry: string | null;
  companySize: string | null;
  signedUpAt: Date;
  onboardedAt: Date | null;
  status: LeadStatus;
  notes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  interests: { categories: string[]; vendors: string[]; industries: string[] };
  digestFrequency: "daily" | "weekly" | "off" | null;
  lastActivityAt: Date | null;
  signals: LeadSignals;
  score: LeadScore;
};

const toDate = (v: unknown): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const latest = (...dates: (Date | null)[]) =>
  dates.reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null);

/**
 * Loads leads (non-staff users) with everything needed for scoring in two queries:
 * one for profiles (with contact-request and membership aggregates joined in) and one that
 * aggregates engagement per (user, type) in SQL. Scores are then computed in memory.
 */
export async function listLeads(filters: LeadFilters & { userIds?: string[] } = {}, now: Date = new Date()): Promise<LeadRow[]> {
  const owner = aliasedTable(user, "owner");
  const crUser = aliasedTable(user, "cr_user");

  const cr = db
    .select({
      userId: sql<string>`${crUser.id}`.as("cr_user_id"),
      count: sql<number>`count(*)::int`.as("cr_count"),
      last: sql<string>`max(${contactRequests.createdAt})`.as("cr_last"),
    })
    .from(contactRequests)
    .innerJoin(
      crUser,
      or(eq(contactRequests.userId, crUser.id), sql`lower(${contactRequests.email}) = lower(${crUser.email})`),
    )
    .groupBy(crUser.id)
    .as("cr");

  const mem = db
    .select({
      userId: sql<string>`${memberships.userId}`.as("mem_user_id"),
      count: sql<number>`count(*)::int`.as("mem_count"),
    })
    .from(memberships)
    .groupBy(memberships.userId)
    .as("mem");

  const where: SQL[] = [eq(user.platformRole, "user")];
  if (filters.userIds) where.push(inArray(user.id, filters.userIds.length ? filters.userIds : [""]));
  if (filters.status === "new") where.push(or(isNull(leadProfiles.status), eq(leadProfiles.status, "new"))!);
  else if (filters.status) where.push(eq(leadProfiles.status, filters.status));
  if (filters.industry) where.push(eq(user.industry, filters.industry));
  if (filters.owner === "none") where.push(isNull(leadProfiles.ownerId));
  else if (filters.owner) where.push(eq(leadProfiles.ownerId, filters.owner));
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(user.name, q), ilike(user.email, q), ilike(user.company, q), ilike(user.jobTitle, q))!);
  }

  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      company: user.company,
      jobTitle: user.jobTitle,
      industry: user.industry,
      companySize: user.companySize,
      createdAt: user.createdAt,
      onboardedAt: user.onboardedAt,
      status: leadProfiles.status,
      notes: leadProfiles.notes,
      ownerId: leadProfiles.ownerId,
      ownerName: owner.name,
      ownerEmail: owner.email,
      categories: userPreferences.categories,
      vendors: userPreferences.vendors,
      industries: userPreferences.industries,
      digestFrequency: userPreferences.digestFrequency,
      crCount: cr.count,
      crLast: cr.last,
      memCount: mem.count,
    })
    .from(user)
    .leftJoin(leadProfiles, eq(leadProfiles.userId, user.id))
    .leftJoin(owner, eq(owner.id, leadProfiles.ownerId))
    .leftJoin(userPreferences, eq(userPreferences.userId, user.id))
    .leftJoin(cr, eq(cr.userId, user.id))
    .leftJoin(mem, eq(mem.userId, user.id))
    .where(and(...where));

  if (rows.length === 0) return [];

  const cutoff = new Date(now.getTime() - RECENT_WINDOW_DAYS * DAY_MS);
  const engagementRows = await db
    .select({
      userId: engagementEvents.userId,
      type: engagementEvents.type,
      total: sql<number>`count(*)::int`,
      recent: sql<number>`(count(*) filter (where ${engagementEvents.createdAt} >= ${cutoff.toISOString()}::timestamptz))::int`,
      last: sql<string>`max(${engagementEvents.createdAt})`,
    })
    .from(engagementEvents)
    .innerJoin(user, eq(user.id, engagementEvents.userId))
    .where(
      and(
        isNotNull(engagementEvents.userId),
        eq(user.platformRole, "user"),
        filters.userIds || rows.length <= 500 ? inArray(engagementEvents.userId, rows.map((r) => r.id)) : undefined,
      ),
    )
    .groupBy(engagementEvents.userId, engagementEvents.type);

  type Agg = { counts: EngagementCounts; lastEngaged: Date | null; lastAny: Date | null };
  const byUser = new Map<string, Agg>();
  for (const e of engagementRows) {
    if (!e.userId) continue;
    let agg = byUser.get(e.userId);
    if (!agg) byUser.set(e.userId, (agg = { counts: emptyEngagement(), lastEngaged: null, lastAny: null }));
    const last = toDate(e.last);
    agg.lastAny = latest(agg.lastAny, last);
    if ((ENGAGEMENT_TYPES as readonly string[]).includes(e.type)) {
      agg.counts[e.type as EngagementType] = { recent: Number(e.recent), total: Number(e.total) };
      agg.lastEngaged = latest(agg.lastEngaged, last);
    }
  }

  const leads: LeadRow[] = rows.map((r) => {
    const agg = byUser.get(r.id);
    const interests = { categories: r.categories ?? [], vendors: r.vendors ?? [], industries: r.industries ?? [] };
    const crLast = toDate(r.crLast);
    const signals: LeadSignals = {
      email: r.email,
      company: r.company,
      jobTitle: r.jobTitle,
      industry: r.industry,
      companySize: r.companySize,
      onboarded: Boolean(r.onboardedAt),
      interestCount: interests.categories.length + interests.vendors.length + interests.industries.length,
      digestSubscribed: r.digestFrequency != null && r.digestFrequency !== "off",
      engagement: agg?.counts ?? emptyEngagement(),
      lastEngagedAt: agg?.lastEngaged ?? null,
      contactRequests: Number(r.crCount ?? 0),
      lastContactRequestAt: crLast,
      workspaceCount: Number(r.memCount ?? 0),
    };
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      company: r.company,
      jobTitle: r.jobTitle,
      industry: r.industry,
      companySize: r.companySize,
      signedUpAt: r.createdAt,
      onboardedAt: r.onboardedAt,
      status: r.status ?? "new",
      notes: r.notes,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      ownerEmail: r.ownerEmail,
      interests,
      digestFrequency: r.digestFrequency,
      lastActivityAt: latest(agg?.lastAny ?? null, crLast, r.onboardedAt, r.createdAt),
      signals,
      score: scoreLead(signals, now),
    };
  });

  const filtered = filters.minScore ? leads.filter((l) => l.score.score >= filters.minScore!) : leads;
  return sortLeads(filtered, filters.sort ?? "score", filters.dir);
}

export function sortLeads(leads: LeadRow[], sort: LeadSort, dir?: "asc" | "desc"): LeadRow[] {
  const direction = dir ?? (sort === "name" || sort === "company" ? "asc" : "desc");
  const sign = direction === "asc" ? 1 : -1;
  const time = (d: Date | null) => d?.getTime() ?? 0;
  const text = (s: string | null) => (s ?? "").toLocaleLowerCase();
  const cmp: Record<LeadSort, (a: LeadRow, b: LeadRow) => number> = {
    score: (a, b) => a.score.score - b.score.score,
    activity: (a, b) => time(a.lastActivityAt) - time(b.lastActivityAt),
    signup: (a, b) => time(a.signedUpAt) - time(b.signedUpAt),
    name: (a, b) => text(a.name).localeCompare(text(b.name)),
    company: (a, b) => text(a.company).localeCompare(text(b.company)),
  };
  // Ties fall back to most recent activity so the list is stable and useful.
  return [...leads].sort((a, b) => sign * cmp[sort](a, b) || time(b.lastActivityAt) - time(a.lastActivityAt));
}

export async function getLead(userId: string, now: Date = new Date()): Promise<LeadRow | null> {
  const [lead] = await listLeads({ userIds: [userId] }, now);
  return lead ?? null;
}

/** Recent engagement events for one lead (timeline), newest first. */
export async function leadTimeline(userId: string, limit = 100) {
  return db
    .select({
      id: engagementEvents.id,
      type: engagementEvents.type,
      metadata: engagementEvents.metadata,
      createdAt: engagementEvents.createdAt,
      storyTitle: stories.title,
      storySlug: stories.slug,
    })
    .from(engagementEvents)
    .leftJoin(stories, eq(stories.id, engagementEvents.storyId))
    .where(eq(engagementEvents.userId, userId))
    .orderBy(desc(engagementEvents.createdAt))
    .limit(limit);
}

/* ───────────────────────────── CSV export ───────────────────────────── */

/**
 * Column order is stable and snake_case so the file maps 1:1 onto CRM import fields
 * (contact: email/first_name/last_name/job_title; account: company/email_domain/industry/company_size).
 */
export const LEAD_CSV_COLUMNS = [
  "lead_id",
  "email",
  "first_name",
  "last_name",
  "full_name",
  "job_title",
  "seniority",
  "company",
  "email_domain",
  "work_email",
  "industry",
  "industry_label",
  "company_size",
  "lead_status",
  "lead_score",
  "lead_tier",
  "score_reasons",
  "owner_email",
  "owner_name",
  "interest_categories",
  "interest_vendors",
  "interest_industries",
  "digest_frequency",
  "signed_up_at",
  "onboarded_at",
  "last_activity_at",
  "story_views_30d",
  "story_clicks_30d",
  "digest_opens_30d",
  "digest_clicks_30d",
  "cta_clicks_30d",
  "engagement_events_total",
  "contact_requests",
  "last_contact_request_at",
  "workspace_count",
  "notes",
  "profile_url",
] as const;

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: parts[0] ?? "", last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

/** RFC 4180 quoting, plus neutralising spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function leadCsvRecord(lead: LeadRow, baseUrl: string): Record<(typeof LEAD_CSV_COLUMNS)[number], unknown> {
  const { first, last } = splitName(lead.name);
  const e = lead.signals.engagement;
  return {
    lead_id: lead.id,
    email: lead.email,
    first_name: first,
    last_name: last,
    full_name: lead.name,
    job_title: lead.jobTitle,
    seniority: lead.score.seniority,
    company: lead.company,
    email_domain: emailDomain(lead.email),
    work_email: isWorkEmail(lead.email),
    industry: lead.industry,
    industry_label: lead.industry ? industryLabel(lead.industry) : null,
    company_size: lead.companySize,
    lead_status: lead.status,
    lead_score: lead.score.score,
    lead_tier: lead.score.tier,
    score_reasons: lead.score.reasons.map((r) => `${r.label} (+${r.points})`).join("; "),
    owner_email: lead.ownerEmail,
    owner_name: lead.ownerName,
    interest_categories: lead.interests.categories.join(";"),
    interest_vendors: lead.interests.vendors.join(";"),
    interest_industries: lead.interests.industries.join(";"),
    digest_frequency: lead.digestFrequency,
    signed_up_at: lead.signedUpAt,
    onboarded_at: lead.onboardedAt,
    last_activity_at: lead.lastActivityAt,
    story_views_30d: e.story_view.recent,
    story_clicks_30d: e.story_click.recent,
    digest_opens_30d: e.digest_open.recent,
    digest_clicks_30d: e.digest_click.recent,
    cta_clicks_30d: e.cta_click.recent,
    engagement_events_total: ENGAGEMENT_TYPES.reduce((sum, t) => sum + e[t].total, 0),
    contact_requests: lead.signals.contactRequests,
    last_contact_request_at: lead.signals.lastContactRequestAt,
    workspace_count: lead.signals.workspaceCount,
    notes: lead.notes,
    profile_url: `${baseUrl}/admin/leads/${lead.id}`,
  };
}

export function leadsToCsv(leads: LeadRow[], baseUrl: string): string {
  const lines = [LEAD_CSV_COLUMNS.join(",")];
  for (const lead of leads) {
    const record = leadCsvRecord(lead, baseUrl);
    lines.push(LEAD_CSV_COLUMNS.map((c) => csvCell(record[c])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
