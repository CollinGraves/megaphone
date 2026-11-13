"use server";

import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { activityLog, assessments, initiatives, memberships, organizations, user, userPreferences } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import {
  functionLabel,
  readContext,
  scoreAssessment,
  selectStarterTemplates,
  SubmissionSchema,
  suggestedPlatforms,
} from "@/lib/assessment";
import { claimAssessment, companyNameFor, isUuid, newClaimToken, sendClaimEmails } from "@/lib/assessment/server";
import { slugify } from "@/lib/ingest/heuristics";
import { COMPANY_SIZES, INDUSTRY_SLUGS, TRIAL_INITIATIVE_LIMIT } from "@/lib/taxonomy";
import { track } from "@/lib/tracking";
import type { ActionState } from "@/lib/utils";
import { clientIpKey, rateLimit } from "@/lib/rate-limit";

const cleanSource = (s: unknown) => (typeof s === "string" ? s.replace(/[^\w:.\-]/g, "").slice(0, 80) : "") || null;

/** Fired once when a visitor finishes the first (context) step. */
export async function trackAssessmentStarted(source?: string) {
  if (!(await rateLimit(`assessment_start:ip:${await clientIpKey()}`, 30, 3600)).allowed) return;
  const current = await getCurrentUser();
  await track("assessment_started", { userId: current?.id ?? null, metadata: { source: cleanSource(source) } });
}

/** Where a freshly claimed assessment's owner should land. */
const landingFor = (assessmentId: string, onboarded: boolean) =>
  onboarded ? `/assessment/${assessmentId}?welcome=1` : `/assessment/${assessmentId}/setup`;

/**
 * Scores and stores a completed questionnaire. Scores are always recomputed server-side from the
 * answers. Anonymous visitors go to the results teaser (claimable with the secret token after
 * sign-up); signed-in users claim it straight away and go to the full report.
 */
export async function submitAssessment(input: unknown): Promise<{ error: string }> {
  const limited = await rateLimit(`assessment_submit:ip:${await clientIpKey()}`, 10, 3600);
  if (!limited.allowed) return { error: "Too many assessments from your network in the last hour. Please try again a little later." };
  const parsed = SubmissionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please answer every question." };
  const { context, answers, source } = parsed.data;
  const { scores, level } = scoreAssessment(answers);

  const claimToken = newClaimToken();
  const [row] = await db
    .insert(assessments)
    .values({ claimToken, answers, context, scores, level: level.id, source })
    .returning({ id: assessments.id });
  await track("assessment_completed", {
    metadata: { assessmentId: row.id, overall: scores.overall, level: level.id, source },
  });

  const current = await getCurrentUser();
  if (!current) redirect(`/assessment/results?token=${claimToken}`);

  const result = await claimAssessment(claimToken, current);
  if (result.status !== "claimed") redirect(`/assessment/results?token=${claimToken}`);
  after(() => sendClaimEmails(result.assessment, current));
  redirect(landingFor(row.id, Boolean(current.onboardedAt)));
}

/* ───────────────────────────── Finish setup (onboarding) ───────────────────────────── */

const SetupSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  company: z.string().trim().min(1, "Please enter your company").max(200),
  jobTitle: z.string().trim().min(1, "Please enter your job title").max(200),
  industry: z.enum(INDUSTRY_SLUGS as [string, ...string[]], { message: "Please choose an industry" }),
  companySize: z.enum(COMPANY_SIZES, { message: "Please choose a company size" }),
  digestFrequency: z.enum(["daily", "weekly", "off"]),
});

const DEFAULT_CATEGORIES = ["model_release", "pricing", "deprecation", "enterprise", "regulation"];

/**
 * The short profile step for people who signed up through the assessment gate. Completes the same
 * profile as /onboarding and seeds feed preferences from their answers, then shows the report.
 */
export async function completeAssessmentSetup(assessmentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "Your session has expired. Please sign in again." };
  if (!isUuid(assessmentId)) return { error: "Assessment not found." };
  const [a] = await db
    .select({ id: assessments.id, context: assessments.context })
    .from(assessments)
    .where(and(eq(assessments.id, assessmentId), eq(assessments.userId, current.id)))
    .limit(1);
  if (!a) return { error: "Assessment not found." };

  const parsed = SetupSchema.safeParse({
    name: form.get("name"),
    company: form.get("company"),
    jobTitle: form.get("jobTitle"),
    industry: form.get("industry"),
    companySize: form.get("companySize"),
    digestFrequency: form.get("digestFrequency") ?? "weekly",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  const { digestFrequency, ...profile } = parsed.data;
  const ctx = readContext(a.context);

  const firstTime = !current.onboardedAt;
  await db
    .update(user)
    .set({ ...profile, onboardedAt: current.onboardedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(user.id, current.id));
  // Seed the Radar feed from the assessment; never overwrite interests someone already chose.
  const prefs = {
    categories: DEFAULT_CATEGORIES,
    vendors: ctx?.tools ?? [],
    industries: [profile.industry],
    minImportance: 2,
    digestFrequency,
  };
  await db
    .insert(userPreferences)
    .values({ userId: current.id, ...prefs })
    .onConflictDoUpdate({ target: userPreferences.userId, set: { digestFrequency } });
  // Sign-up creates an empty preferences row; fill interests only if none were chosen yet.
  await db
    .update(userPreferences)
    .set({ categories: prefs.categories, vendors: prefs.vendors, industries: prefs.industries })
    .where(
      and(
        eq(userPreferences.userId, current.id),
        sql`cardinality(${userPreferences.categories}) + cardinality(${userPreferences.vendors}) + cardinality(${userPreferences.industries}) = 0`,
      ),
    );
  if (firstTime) await track("onboarded", { userId: current.id, metadata: { ...prefs, source: "assessment" } });
  redirect(`/assessment/${a.id}?welcome=1`);
}

/* ───────────────────────────── Starter workspace ───────────────────────────── */

const RESERVED_SLUGS = new Set(["new", "admin", "api", "settings", "invite", "app", "www"]);

function slugCandidates(name: string): string[] {
  let base = slugify(name, 40);
  if (base.length < 2 || RESERVED_SLUGS.has(base) || base === "story") base = "ai-portfolio";
  const suffix = () => Math.random().toString(36).slice(2, 6);
  return [base, `${base}-ai`, `${base}-2`, `${base}-3`, `${base}-${suffix()}`, `${base}-${suffix()}${suffix()}`];
}

/**
 * Creates a free "trial" workspace from the owner's assessment, pre-filled with up to
 * TRIAL_INITIATIVE_LIMIT suggested initiatives. Idempotent: an assessment gets at most one
 * workspace, and a person who already created one from an earlier assessment is sent back to it.
 */
export async function createStarterWorkspace(_prev: ActionState, form: FormData): Promise<ActionState> {
  const current = await getCurrentUser();
  if (!current) return { error: "Your session has expired. Please sign in again." };
  const assessmentId = form.get("assessmentId");
  if (!isUuid(assessmentId)) return { error: "Assessment not found." };

  const slug = await db.transaction(async (tx) => {
    // Lock the assessment so a double-submit can't create two workspaces.
    const [a] = await tx
      .select()
      .from(assessments)
      .where(and(eq(assessments.id, assessmentId), eq(assessments.userId, current.id)))
      .for("update")
      .limit(1);
    if (!a) return null;

    if (a.orgId) {
      const [org] = await tx.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, a.orgId)).limit(1);
      if (org) return org.slug;
    }

    // One free starter workspace per person: reuse one they still own from an earlier assessment.
    const [previous] = await tx
      .select({ id: organizations.id, slug: organizations.slug })
      .from(assessments)
      .innerJoin(organizations, eq(organizations.id, assessments.orgId))
      .innerJoin(memberships, and(eq(memberships.orgId, organizations.id), eq(memberships.userId, current.id)))
      .where(
        and(
          eq(assessments.userId, current.id),
          ne(assessments.id, a.id),
          isNotNull(assessments.orgId),
          eq(organizations.plan, "trial"),
          inArray(memberships.role, ["owner", "admin"]),
        ),
      )
      .limit(1);
    if (previous) {
      await tx.update(assessments).set({ orgId: previous.id }).where(eq(assessments.id, a.id));
      return previous.slug;
    }

    const ctx = readContext(a.context);
    const overall = Number(a.scores.overall ?? 0);
    const name = companyNameFor(current).slice(0, 120);
    const industry = ctx?.industry ?? (current.industry && (INDUSTRY_SLUGS as string[]).includes(current.industry) ? current.industry : null);

    let org: { id: string; slug: string } | undefined;
    for (const candidate of slugCandidates(name)) {
      [org] = await tx
        .insert(organizations)
        .values({ name, slug: candidate, industry, plan: "trial", provisionedById: null })
        .onConflictDoNothing({ target: organizations.slug })
        .returning({ id: organizations.id, slug: organizations.slug });
      if (org) break;
    }
    if (!org) throw new Error("Could not allocate a workspace slug");

    await tx.insert(memberships).values({ orgId: org.id, userId: current.id, role: "owner" });

    const templates = ctx
      ? selectStarterTemplates({ functions: ctx.functions, industry: ctx.industry, tools: ctx.tools, overall }, TRIAL_INITIATIVE_LIMIT)
      : [];
    const created = templates.length
      ? await tx
          .insert(initiatives)
          .values(
            templates.map((t) => ({
              orgId: org.id,
              title: t.title,
              problemStatement: t.problem,
              proposedSolution: `${t.solution}\n\nTypical value drivers: ${t.valueDrivers.join("; ")}.`,
              businessUnit: t.function === "cross_functional" ? "Company-wide" : functionLabel(t.function),
              stage: "idea" as const,
              platforms: suggestedPlatforms(t, ctx?.tools ?? []),
              buildApproach: t.buildApproach,
              valueScore: t.scores.value,
              feasibilityScore: t.scores.feasibility,
              alignmentScore: t.scores.alignment,
              riskScore: t.scores.risk,
              customerFacing: t.customerFacing,
              tags: ["starter", `effort-${t.effort.toLowerCase()}`],
              createdById: current.id,
            })),
          )
          .returning({ id: initiatives.id, title: initiatives.title })
      : [];

    await tx.insert(activityLog).values([
      {
        orgId: org.id,
        userId: current.id,
        action: "workspace.created_from_assessment",
        detail: { assessmentId: a.id, overall, level: a.level, initiatives: created.length },
      },
      ...created.map((i) => ({ orgId: org.id, userId: current.id, initiativeId: i.id, action: "initiative.created", detail: { title: i.title, source: "assessment" } })),
    ]);
    await tx.update(assessments).set({ orgId: org.id }).where(eq(assessments.id, a.id));
    return org.slug;
  });

  if (!slug) return { error: "Assessment not found." };
  redirect(`/w/${slug}`);
}
