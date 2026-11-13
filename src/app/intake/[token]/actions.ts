"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  INTAKE_DAILY_LIMIT_PER_EMAIL,
  INTAKE_DAILY_LIMIT_PER_ORG,
  countRecentIdeas,
  logIdeaActivity,
  notifyTriagersOfNewIdea,
  parseIdeaFields,
  sendIntakeConfirmation,
} from "@/app/(app)/w/[slug]/ideas/_lib/server";
import { db } from "@/db";
import { ideas, organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { validateIntakeEmail } from "@/lib/ideas";
import type { ActionState } from "@/lib/utils";
import { TOKEN_RE } from "./token";

const submitterSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().min(3, "Please enter your work email.").max(254),
});

const zodMessage = (err: z.ZodError) => {
  const issue = err.issues[0];
  if (!issue) return "Please check the form and try again.";
  const field = String(issue.path[0] ?? "");
  const label: Record<string, string> = { title: "Idea", problem: "Problem", peopleAffected: "People", hoursPerWeek: "Hours per week", desiredOutcome: "Outcome" };
  return label[field] ? `${label[field]}: ${issue.message}` : issue.message;
};

/** Public: anyone with the link and an allowed work email. No session required. */
export async function submitIntakeIdea(_prev: ActionState, form: FormData): Promise<ActionState> {
  // Honeypot: real people never see this field; bots fill everything. Pretend it worked.
  if (form.get("website")) return { ok: true };

  const token = form.get("token");
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { error: "This intake link is no longer active." };
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, intakeAllowedDomains: organizations.intakeAllowedDomains })
    .from(organizations)
    .where(and(eq(organizations.intakeToken, token), eq(organizations.status, "active")))
    .limit(1);
  if (!org) return { error: "This intake link is no longer active. Ask your AI team for the current link." };

  let fields;
  let submitter;
  try {
    submitter = submitterSchema.parse({ name: form.get("name") ?? "", email: form.get("email") ?? "" });
    fields = parseIdeaFields(form);
  } catch (err) {
    if (err instanceof z.ZodError) return { error: zodMessage(err) };
    throw err;
  }

  const check = validateIntakeEmail(submitter.email, org.intakeAllowedDomains);
  if (!check.ok) return { error: check.message };

  const [mine, everyone] = await Promise.all([
    countRecentIdeas(org.id, { email: check.email }),
    countRecentIdeas(org.id, { channel: "intake_link" }),
  ]);
  if (mine >= INTAKE_DAILY_LIMIT_PER_EMAIL)
    return { error: `You’ve already submitted ${INTAKE_DAILY_LIMIT_PER_EMAIL} ideas today — thank you! Please come back tomorrow to share more.` };
  if (everyone >= INTAKE_DAILY_LIMIT_PER_ORG) return { error: "The AI team has received a lot of ideas today. Please try again tomorrow." };

  // Signed in with the same address? Link the idea to the account so it shows up under "My ideas".
  const current = await getCurrentUser();
  const submittedById = current && current.email.toLowerCase() === check.email ? current.id : null;

  const [created] = await db
    .insert(ideas)
    .values({ ...fields, orgId: org.id, submitterName: submitter.name, submitterEmail: check.email, submittedById, channel: "intake_link" })
    .returning();
  await logIdeaActivity(org.id, submittedById, "idea.submitted", {
    ideaId: created.id,
    title: created.title,
    channel: "intake_link",
    submitterName: created.submitterName,
  });
  sendIntakeConfirmation(org, created);
  await notifyTriagersOfNewIdea(org, created);
  revalidatePath(`/w/${org.slug}`, "layout");
  return { ok: true, message: check.email };
}
