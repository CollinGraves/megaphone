import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────────────────────────── Auth (Better Auth) ───────────────────────────── */

/** North Labs staff roles. Everyone who signs up is a plain "user". */
export const platformRole = pgEnum("platform_role", ["user", "consultant", "admin"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  platformRole: platformRole("platform_role").notNull().default("user"),
  // Lead-capture profile, collected during onboarding
  company: text("company"),
  jobTitle: text("job_title"),
  industry: text("industry"),
  companySize: text("company_size"),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /** Registrable company domain for work emails (e.g. "acme.com"); null for personal emails. */
  companyDomain: text("company_domain"),
  /** Who invited this person (colleague referral). */
  referredById: text("referred_by_id"),
  /** Where the sign-up came from: hero, story CTA, colleague invite, utm_source… */
  signupSource: text("signup_source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("user_company_domain_idx").on(t.companyDomain)]);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────────── Radar Feed ─────────────────────────────── */

export const sourceType = pgEnum("source_type", ["rss", "sitemap"]);

export const sources = pgTable("sources", {
  id: id(),
  name: text("name").notNull(),
  homepageUrl: text("homepage_url"),
  feedUrl: text("feed_url").notNull().unique(),
  type: sourceType("type").notNull().default("rss"),
  /** For sitemap sources: only URLs containing this path are considered (e.g. "/news/"). */
  pathFilter: text("path_filter"),
  /** Vendor slug when the source is first-party (e.g. "openai"). */
  vendor: text("vendor"),
  /** Category hint used by the heuristic classifier. */
  defaultCategory: text("default_category"),
  /** 1 (low) – 5 (canonical/first-party). Feeds importance scoring. */
  authority: integer("authority").notNull().default(3),
  /** True when the feed is AI-focused. General feeds are filtered by AI keywords / the model. */
  aiOnly: boolean("ai_only").notNull().default(true),
  /** Max items to take per fetch (keeps high-volume feeds like arXiv in check). */
  maxItemsPerFetch: integer("max_items_per_fetch").notNull().default(25),
  active: boolean("active").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  createdAt: createdAt(),
});

export const storyStatus = pgEnum("story_status", ["published", "hidden"]);

/** A deduplicated news event. Many articles (from many sources) roll up into one story. */
export const stories = pgTable(
  "stories",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    whyItMatters: text("why_it_matters"),
    categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
    vendors: text("vendors").array().notNull().default(sql`'{}'::text[]`),
    industries: text("industries").array().notNull().default(sql`'{}'::text[]`),
    /** 1–5. Combination of model judgement, source authority and coverage breadth. */
    importance: integer("importance").notNull().default(2),
    primaryUrl: text("primary_url").notNull(),
    primarySourceName: text("primary_source_name"),
    articleCount: integer("article_count").notNull().default(1),
    status: storyStatus("status").notNull().default("published"),
    featured: boolean("featured").notNull().default(false),
    classifiedBy: text("classified_by").notNull().default("heuristic"), // "heuristic" | "llm"
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("stories_published_idx").on(t.publishedAt),
    index("stories_categories_idx").using("gin", t.categories),
    index("stories_vendors_idx").using("gin", t.vendors),
  ],
);

/** A single item pulled from a source. */
export const articles = pgTable(
  "articles",
  {
    id: id(),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    storyId: text("story_id").references(() => stories.id, { onDelete: "set null" }),
    url: text("url").notNull().unique(),
    title: text("title").notNull(),
    excerpt: text("excerpt"),
    author: text("author"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("articles_story_idx").on(t.storyId),
    index("articles_unprocessed_idx").on(t.processedAt),
  ],
);

export const digestFrequency = pgEnum("digest_frequency", ["daily", "weekly", "off"]);

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
  vendors: text("vendors").array().notNull().default(sql`'{}'::text[]`),
  industries: text("industries").array().notNull().default(sql`'{}'::text[]`),
  minImportance: integer("min_importance").notNull().default(2),
  digestFrequency: digestFrequency("digest_frequency").notNull().default("weekly"),
  lastDigestSentAt: timestamp("last_digest_sent_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const savedStories = pgTable(
  "saved_stories",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.storyId] })],
);

export const digests = pgTable("digests", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  storyIds: text("story_ids").array().notNull(),
  status: text("status").notNull(), // "sent" | "skipped" | "failed" | "logged"
  error: text("error"),
  sentAt: createdAt(),
});

/** Engagement signals. Drive lead scoring and future CRM sync. */
export const engagementEvents = pgTable(
  "engagement_events",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // story_view | story_click | digest_open | digest_click | cta_click | signup | onboarded
    storyId: text("story_id").references(() => stories.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("engagement_user_idx").on(t.userId), index("engagement_created_idx").on(t.createdAt)],
);

export const ingestionRuns = pgTable("ingestion_runs", {
  id: id(),
  trigger: text("trigger").notNull(), // cron | manual | script
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  stats: jsonb("stats").$type<Record<string, number>>(),
  error: text("error"),
});

export const leadStatus = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "customer",
  "disqualified",
]);

/** North Labs' sales view of a signed-up user. */
export const leadProfiles = pgTable("lead_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  status: leadStatus("status").notNull().default("new"),
  notes: text("notes"),
  ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
  updatedAt: updatedAt(),
});

/** Free AI readiness assessment (public lead magnet). Anonymous until claimed by a signed-in user. */
export const assessments = pgTable(
  "assessments",
  {
    id: id(),
    /** Secret used to claim an anonymous assessment after sign-up. */
    claimToken: text("claim_token").notNull().unique(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** questionId -> chosen option index */
    answers: jsonb("answers").$type<Record<string, number>>().notNull(),
    /** Company context: industry, size, role, functions, tools in use. */
    context: jsonb("context").$type<Record<string, unknown>>().notNull(),
    /** Per-dimension 0–100 scores plus "overall". */
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    level: text("level").notNull(),
    /** Starter workspace created from the results, if any. */
    orgId: text("org_id").references(() => organizations.id, { onDelete: "set null" }),
    source: text("source"),
    createdAt: createdAt(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
  },
  (t) => [index("assessments_user_idx").on(t.userId)],
);

/** "Talk to North Labs" form submissions (public site). */
export const contactRequests = pgTable("contact_requests", {
  id: id(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  message: text("message"),
  source: text("source"), // which CTA produced it
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const enrichmentStatus = pgEnum("enrichment_status", ["pending", "requested", "enriched", "failed"]);

/** A company, keyed by its email domain. Enriched by an external provider (e.g. Clay) via webhook. */
export const companies = pgTable("companies", {
  domain: text("domain").primaryKey(),
  name: text("name").notNull(),
  website: text("website"),
  industry: text("industry"),
  employeeCount: integer("employee_count"),
  /** One of COMPANY_SIZES. */
  sizeRange: text("size_range"),
  headquarters: text("headquarters"),
  linkedinUrl: text("linkedin_url"),
  description: text("description"),
  enrichmentStatus: enrichmentStatus("enrichment_status").notNull().default("pending"),
  enrichmentSource: text("enrichment_source"),
  enrichmentRequestedAt: timestamp("enrichment_requested_at", { withTimezone: true }),
  enrichedAt: timestamp("enriched_at", { withTimezone: true }),
  raw: jsonb("raw").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Other people at a company, found by enrichment. For North Labs outreach; never emailed automatically. */
export const companyContacts = pgTable(
  "company_contacts",
  {
    id: id(),
    domain: text("domain")
      .notNull()
      .references(() => companies.domain, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    title: text("title"),
    email: text("email"),
    linkedinUrl: text("linkedin_url"),
    source: text("source"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("company_contacts_unique_idx").on(t.domain, t.fullName)],
);

/* ───────────────────────────── Temporal graph ───────────────────────────── */

export const entityKind = pgEnum("entity_kind", ["vendor", "product", "model", "company", "regulation"]);

/** Things the news is about: vendors, products, models, companies, regulations. */
export const entities = pgTable(
  "entities",
  {
    id: id(),
    kind: entityKind("kind").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Taxonomy vendor slug: the vendor itself, or the maker of a product/model. */
    vendorSlug: text("vendor_slug"),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("entities_kind_slug_idx").on(t.kind, t.slug), index("entities_vendor_idx").on(t.vendorSlug)],
);

export const storyEntities = pgTable(
  "story_entities",
  {
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.entityId] }), index("story_entities_entity_idx").on(t.entityId)],
);

export const factPredicate = pgEnum("fact_predicate", [
  "price", // value = price description; valid while current
  "retires_on", // validFrom = retirement/shutdown date
  "deprecated_on", // validFrom = deprecation date
  "effective_on", // regulation or policy obligations take effect
  "available_on", // general availability / launch date
  "adopted", // subject (company) adopted object (product/vendor)
  "supersedes", // subject (model/product) replaces object
]);

/**
 * Time-bounded facts. A new fact for the same (subject, predicate, object) closes the previous one
 * (sets validTo and supersededById), so the graph always knows what is current and what changed.
 */
export const entityFacts = pgTable(
  "entity_facts",
  {
    id: id(),
    subjectId: text("subject_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    predicate: factPredicate("predicate").notNull(),
    objectId: text("object_id").references(() => entities.id, { onDelete: "cascade" }),
    value: text("value"),
    /** When the fact becomes true (e.g. the retirement date). Null = from when it was reported. */
    validFrom: date("valid_from"),
    /** When it stopped being true (set when superseded). */
    validTo: date("valid_to"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    storyId: text("story_id").references(() => stories.id, { onDelete: "set null" }),
    supersededById: text("superseded_by_id"),
  },
  (t) => [
    index("entity_facts_subject_idx").on(t.subjectId, t.predicate),
    index("entity_facts_valid_from_idx").on(t.validFrom),
  ],
);

/** Story arcs: a later story that updates or follows up on an earlier one. */
export const storyLinks = pgTable(
  "story_links",
  {
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    relatedStoryId: text("related_story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // follow_up | supersedes
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.relatedStoryId] }), index("story_links_related_idx").on(t.relatedStoryId)],
);

export const stackStatus = pgEnum("stack_status", ["inferred", "confirmed", "rejected"]);

/** What a company (by email domain) runs on, with when we learned it and how sure we are. */
export const companyStack = pgTable(
  "company_stack",
  {
    domain: text("domain")
      .notNull()
      .references(() => companies.domain, { onDelete: "cascade" }),
    entityId: text("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    /** enrichment | workspace | colleagues | user */
    source: text("source").notNull(),
    confidence: doublePrecision("confidence").notNull().default(0.5),
    status: stackStatus("status").notNull().default("inferred"),
    reviewedById: text("reviewed_by_id").references(() => user.id, { onDelete: "set null" }),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp("valid_to", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.domain, t.entityId] })],
);

/* ─────────────────────────────── Workspaces ─────────────────────────────── */

export const orgPlan = pgEnum("org_plan", ["engagement", "trial", "pro", "enterprise"]);
export const orgStatus = pgEnum("org_status", ["active", "suspended"]);
export const orgRole = pgEnum("org_role", ["owner", "admin", "editor", "viewer"]);

export type GovernancePolicy = {
  /** Initiatives can't move into these stages until their governance review is approved. */
  approvalRequiredStages: ("pilot" | "production")[];
  /** Approved initiatives are due for re-review after this many months. */
  reviewIntervalMonths: number;
};

export type ScoringWeights = {
  value: number;
  feasibility: number;
  alignment: number;
  risk: number;
};

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  industry: text("industry"),
  plan: orgPlan("plan").notNull().default("engagement"),
  status: orgStatus("status").notNull().default("active"),
  /** Default loaded hourly cost, used to convert hours saved into dollars. */
  defaultHourlyRate: doublePrecision("default_hourly_rate").notNull().default(75),
  scoringWeights: jsonb("scoring_weights")
    .$type<ScoringWeights>()
    .notNull()
    .default({ value: 0.4, feasibility: 0.3, alignment: 0.2, risk: 0.1 }),
  /** Governance policy: which stages require an approved review, and how often approvals are re-reviewed. */
  governancePolicy: jsonb("governance_policy")
    .$type<GovernancePolicy>()
    .notNull()
    .default({ approvalRequiredStages: [], reviewIntervalMonths: 12 }),
  /** Secret token for the shareable idea-intake link (/intake/<token>). Null = link disabled. */
  intakeToken: text("intake_token").unique(),
  /** Email domains allowed to submit ideas through the intake link (e.g. ["acme.com"]). Empty = any work email. */
  intakeAllowedDomains: text("intake_allowed_domains").array().notNull().default(sql`'{}'::text[]`),
  // Reserved for self-service billing
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  provisionedById: text("provisioned_by_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull().default("viewer"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

/** North Labs consultants assigned to a client workspace. */
export const consultantAssignments = pgTable(
  "consultant_assignments",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: orgRole("role").notNull().default("viewer"),
    token: text("token").notNull().unique(),
    invitedById: text("invited_by_id").references(() => user.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_org_idx").on(t.orgId)],
);

export const systemCategory = pgEnum("system_category", [
  "crm",
  "erp",
  "data_warehouse",
  "database",
  "document_store",
  "hris",
  "ticketing",
  "communication",
  "finance",
  "marketing",
  "custom_app",
  "other",
]);

/** A company's system of record (Salesforce, SAP, Snowflake…). */
export const systems = pgTable(
  "systems",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: systemCategory("category").notNull().default("other"),
    vendor: text("vendor"),
    owner: text("owner"),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("systems_org_name_idx").on(t.orgId, t.name)],
);

export const initiativeStage = pgEnum("initiative_stage", [
  "idea",
  "evaluating",
  "building",
  "pilot",
  "production",
  "retired",
]);
export const riskTier = pgEnum("risk_tier", ["unclassified", "minimal", "limited", "high", "prohibited"]);
export const humanOversight = pgEnum("human_oversight", ["none", "spot_check", "review_all", "human_decides"]);
export const approvalStatus = pgEnum("approval_status", ["not_submitted", "pending", "approved", "conditional", "rejected"]);
export const initiativeHealth = pgEnum("initiative_health", ["on_track", "at_risk", "blocked"]);
export const buildApproach = pgEnum("build_approach", ["buy", "configure", "build", "partner"]);

export const initiatives = pgTable(
  "initiatives",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    problemStatement: text("problem_statement").notNull().default(""),
    proposedSolution: text("proposed_solution").notNull().default(""),
    businessUnit: text("business_unit"),
    sponsor: text("sponsor"),
    ownerName: text("owner_name"),
    stage: initiativeStage("stage").notNull().default("idea"),
    health: initiativeHealth("health").notNull().default("on_track"),
    /** Vendor slugs (anthropic, openai, microsoft…) the capability is built on. */
    platforms: text("platforms").array().notNull().default(sql`'{}'::text[]`),
    /** Free-form model / product names (e.g. "Claude Opus 5.5", "Copilot Studio"). */
    models: text("models").array().notNull().default(sql`'{}'::text[]`),
    buildApproach: buildApproach("build_approach"),
    // Prioritization inputs, each 1–5
    valueScore: integer("value_score").notNull().default(3),
    feasibilityScore: integer("feasibility_score").notNull().default(3),
    alignmentScore: integer("alignment_score").notNull().default(3),
    riskScore: integer("risk_score").notNull().default(3), // higher = riskier
    /** Optional manual override of rank; lower = higher priority. */
    rankOverride: integer("rank_override"),
    estimatedBuildCost: doublePrecision("estimated_build_cost"),
    estimatedAnnualRunCost: doublePrecision("estimated_annual_run_cost"),
    targetDate: date("target_date"),
    launchedAt: date("launched_at"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // ── Governance ──
    riskTier: riskTier("risk_tier").notNull().default("unclassified"),
    customerFacing: boolean("customer_facing"),
    /** Makes or informs decisions about individuals (hiring, credit, health, education, benefits…). */
    affectsIndividuals: boolean("affects_individuals"),
    humanOversight: humanOversight("human_oversight"),
    approvalStatus: approvalStatus("approval_status").notNull().default("not_submitted"),
    approvalRequestedAt: timestamp("approval_requested_at", { withTimezone: true }),
    approvalRequestedById: text("approval_requested_by_id").references(() => user.id, { onDelete: "set null" }),
    approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
    approvalDecidedById: text("approval_decided_by_id").references(() => user.id, { onDelete: "set null" }),
    approvalConditions: text("approval_conditions"),
    reviewDueOn: date("review_due_on"),
    governanceNotes: text("governance_notes"),
    /** The idea this initiative was converted from, if any. */
    sourceIdeaId: text("source_idea_id"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("initiatives_org_idx").on(t.orgId)],
);

export const accessStatus = pgEnum("access_status", [
  "not_requested",
  "requested",
  "granted",
  "blocked",
]);
export const dataSensitivity = pgEnum("data_sensitivity", [
  "public",
  "internal",
  "confidential",
  "pii",
  "phi",
  "pci",
]);

export const dataDependencies = pgTable(
  "data_dependencies",
  {
    id: id(),
    initiativeId: text("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    systemId: text("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
    dataDescription: text("data_description").notNull(),
    accessStatus: accessStatus("access_status").notNull().default("not_requested"),
    sensitivity: dataSensitivity("sensitivity").notNull().default("internal"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("data_deps_initiative_idx").on(t.initiativeId),
    index("data_deps_system_idx").on(t.systemId),
  ],
);

export const metricType = pgEnum("metric_type", [
  "hours_saved",
  "cost_saved",
  "revenue_generated",
  "custom",
]);
export const metricPeriod = pgEnum("metric_period", ["monthly", "annual", "one_time"]);

export const impactMetrics = pgTable(
  "impact_metrics",
  {
    id: id(),
    initiativeId: text("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    type: metricType("type").notNull(),
    name: text("name").notNull(),
    /** "hours" | "usd" | anything for custom metrics */
    unit: text("unit").notNull(),
    period: metricPeriod("period").notNull().default("monthly"),
    estimatedValue: doublePrecision("estimated_value"),
    /** For hours_saved metrics: overrides the org default loaded hourly rate. */
    hourlyRate: doublePrecision("hourly_rate"),
    assumptions: text("assumptions"),
    createdAt: createdAt(),
  },
  (t) => [index("impact_metrics_initiative_idx").on(t.initiativeId)],
);

/** Actuals, recorded per period (usually monthly). */
export const impactMeasurements = pgTable(
  "impact_measurements",
  {
    id: id(),
    metricId: text("metric_id")
      .notNull()
      .references(() => impactMetrics.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    value: doublePrecision("value").notNull(),
    note: text("note"),
    recordedById: text("recorded_by_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("impact_measurement_period_idx").on(t.metricId, t.periodStart)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    initiativeId: text("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_initiative_idx").on(t.initiativeId)],
);

/** Audit trail: who changed what, when. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    initiativeId: text("initiative_id").references(() => initiatives.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_org_idx").on(t.orgId, t.createdAt)],
);

export const ideaStatus = pgEnum("idea_status", ["new", "under_review", "accepted", "declined", "duplicate"]);
export const ideaUrgency = pgEnum("idea_urgency", ["low", "medium", "high"]);

/** Ideas submitted by employees (inside the workspace or via the shareable intake link), triaged into initiatives. */
export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    problem: text("problem").notNull(),
    desiredOutcome: text("desired_outcome"),
    department: text("department"),
    /** How often the task happens, e.g. "daily", "weekly". */
    frequency: text("frequency"),
    peopleAffected: integer("people_affected"),
    /** Rough time spent on the task today, per person per week. */
    hoursPerWeek: doublePrecision("hours_per_week"),
    systemsInvolved: text("systems_involved"),
    urgency: ideaUrgency("urgency").notNull().default("medium"),
    submitterName: text("submitter_name").notNull(),
    submitterEmail: text("submitter_email").notNull(),
    submittedById: text("submitted_by_id").references(() => user.id, { onDelete: "set null" }),
    /** "workspace" (signed-in member) or "intake_link". */
    channel: text("channel").notNull().default("workspace"),
    status: ideaStatus("status").notNull().default("new"),
    triageNotes: text("triage_notes"),
    declineReason: text("decline_reason"),
    triagedById: text("triaged_by_id").references(() => user.id, { onDelete: "set null" }),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    initiativeId: text("initiative_id").references(() => initiatives.id, { onDelete: "set null" }),
    duplicateOfId: text("duplicate_of_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ideas_org_status_idx").on(t.orgId, t.status)],
);

/** Radar stories that affect a specific initiative (vendor overlap on high-signal categories). */
export const initiativeAlerts = pgTable(
  "initiative_alerts",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    initiativeId: text("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("initiative_alert_unique_idx").on(t.initiativeId, t.storyId),
    index("initiative_alerts_org_idx").on(t.orgId),
  ],
);

/* ─────────────────────────────── Relations ─────────────────────────────── */

export const storiesRelations = relations(stories, ({ many }) => ({
  articles: many(articles),
}));
export const articlesRelations = relations(articles, ({ one }) => ({
  story: one(stories, { fields: [articles.storyId], references: [stories.id] }),
  source: one(sources, { fields: [articles.sourceId], references: [sources.id] }),
}));
export const initiativesRelations = relations(initiatives, ({ one, many }) => ({
  org: one(organizations, { fields: [initiatives.orgId], references: [organizations.id] }),
  dependencies: many(dataDependencies),
  metrics: many(impactMetrics),
  comments: many(comments),
}));
export const dataDependenciesRelations = relations(dataDependencies, ({ one }) => ({
  initiative: one(initiatives, {
    fields: [dataDependencies.initiativeId],
    references: [initiatives.id],
  }),
  system: one(systems, { fields: [dataDependencies.systemId], references: [systems.id] }),
}));
export const impactMetricsRelations = relations(impactMetrics, ({ one, many }) => ({
  initiative: one(initiatives, {
    fields: [impactMetrics.initiativeId],
    references: [initiatives.id],
  }),
  measurements: many(impactMeasurements),
}));
export const impactMeasurementsRelations = relations(impactMeasurements, ({ one }) => ({
  metric: one(impactMetrics, {
    fields: [impactMeasurements.metricId],
    references: [impactMetrics.id],
  }),
}));
export const commentsRelations = relations(comments, ({ one }) => ({
  initiative: one(initiatives, { fields: [comments.initiativeId], references: [initiatives.id] }),
  user: one(user, { fields: [comments.userId], references: [user.id] }),
}));
export const systemsRelations = relations(systems, ({ many }) => ({
  dependencies: many(dataDependencies),
}));

export type Company = typeof companies.$inferSelect;
export type Entity = typeof entities.$inferSelect;
export type EntityFact = typeof entityFacts.$inferSelect;
export type Story = typeof stories.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Initiative = typeof initiatives.$inferSelect;
export type Idea = typeof ideas.$inferSelect;
export type Assessment = typeof assessments.$inferSelect;
export type System = typeof systems.$inferSelect;
export type ImpactMetric = typeof impactMetrics.$inferSelect;
export type ImpactMeasurement = typeof impactMeasurements.$inferSelect;
export type OrgRole = (typeof orgRole.enumValues)[number];
export type PlatformRole = (typeof platformRole.enumValues)[number];
