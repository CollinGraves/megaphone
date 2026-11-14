import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ProfileFields } from "@/components/preferences-fields";
import { Card } from "@/components/ui";
import { toolLabel } from "@/lib/assessment";
import { companyNameFor, findForViewer, summarize } from "@/lib/assessment/server";
import { getCurrentUser } from "@/lib/auth/session";
import { industryLabel } from "@/lib/taxonomy";
import { completeAssessmentSetup } from "../../actions";
import { ScoreRing } from "../../_components/visuals";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "One last step",
  robots: { index: false, follow: false },
};

const DIGEST_OPTIONS = [
  { value: "weekly", label: "Weekly digest", hint: "Mondays" },
  { value: "daily", label: "Daily briefing", hint: "Weekday mornings" },
  { value: "off", label: "No email", hint: "Just the feed" },
] as const;

/** Profile step for people who signed up through the assessment gate (replaces /onboarding for them). */
export default async function AssessmentSetupPage({ params }: PageProps<"/assessment/[id]/setup">) {
  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect(`/sign-in?next=${encodeURIComponent(`/assessment/${id}/setup`)}`);
  const assessment = await findForViewer(id, current);
  if (!assessment || assessment.userId !== current.id) notFound();
  if (current.onboardedAt) redirect(`/assessment/${assessment.id}`);

  const { level, overall, context } = summarize(assessment);
  const [company] = current.companyDomain
    ? await db.select({ name: companies.name, sizeRange: companies.sizeRange }).from(companies).where(eq(companies.domain, current.companyDomain)).limit(1)
    : [];
  const defaults = {
    name: current.name,
    company: current.company ?? company?.name ?? (current.companyDomain ? companyNameFor(current) : null),
    jobTitle: current.jobTitle,
    industry: current.industry ?? context?.industry ?? null,
    companySize: current.companySize ?? context?.companySize ?? company?.sizeRange ?? null,
  };
  const feedFor = [context ? industryLabel(context.industry) : null, ...(context?.tools ?? []).slice(0, 3).map(toolLabel)].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="grid gap-8 md:grid-cols-[1fr_260px]">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-radar-700">One last step</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Tell us a little about you</h1>
          <p className="mt-2 text-slate-600">
            So we can tailor your report and set up your free {BRAND} briefing
            {feedFor ? ` for ${feedFor}` : ""}. You can change this anytime in Settings.
          </p>
          <ActionForm action={completeAssessmentSetup.bind(null, assessment.id)} className="mt-8 space-y-6">
            <Card className="p-6">
              <ProfileFields d={defaults} />
            </Card>
            <Card className="p-6">
              <fieldset>
                <legend className="font-semibold text-slate-900">{BRAND} briefing</legend>
                <p className="mt-0.5 text-sm text-slate-500">The AI news that matters to your industry and tools, in one short email.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {DIGEST_OPTIONS.map((o) => (
                    <label key={o.value} className="cursor-pointer">
                      <input type="radio" name="digestFrequency" value={o.value} defaultChecked={o.value === "weekly"} className="peer sr-only" />
                      <span className="block rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm transition-colors peer-checked:border-radar-600 peer-checked:bg-radar-50 peer-checked:ring-1 peer-checked:ring-radar-600 peer-focus-visible:ring-2 peer-focus-visible:ring-radar-500 hover:border-slate-300">
                        <span className="block font-medium text-slate-900">{o.label}</span>
                        <span className="block text-xs text-slate-500">{o.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </Card>
            <div className="flex justify-end">
              <SubmitButton size="lg" pendingText="Opening your report…">
                Show my full report
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
        <aside className="order-first md:order-none">
          <Card className="flex items-center gap-4 p-5 md:flex-col md:text-center">
            <ScoreRing score={overall} size={112} />
            <div>
              <div className="text-sm text-slate-500">Your readiness</div>
              <div className="text-lg font-semibold text-slate-900">{level?.label}</div>
              <p className="mt-1 text-xs text-slate-500">Your full report is ready.</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
