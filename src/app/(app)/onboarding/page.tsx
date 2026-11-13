import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/forms";
import { InterestFields, ProfileFields } from "@/components/preferences-fields";
import { Card } from "@/components/ui";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { completeOnboarding } from "../settings/actions";

export const metadata: Metadata = { title: "Set up your radar" };

export default async function OnboardingPage() {
  const user = await requireUser("/onboarding");
  const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1);
  const defaults = {
    ...user,
    categories: prefs?.categories.length ? prefs.categories : ["model_release", "pricing", "deprecation", "enterprise", "regulation"],
    vendors: prefs?.vendors ?? [],
    industries: prefs?.industries.length ? prefs.industries : [],
    minImportance: prefs?.minImportance ?? 2,
    digestFrequency: prefs?.digestFrequency ?? "weekly",
  };
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Set up your radar</h1>
      <p className="mt-1 text-slate-600">Two quick steps so we can filter the AI firehose down to what matters to you.</p>
      <ActionForm action={completeOnboarding} className="mt-8 space-y-6">
        <Card className="p-6">
          <h2 className="mb-1 font-semibold text-slate-900">1. About you</h2>
          <p className="mb-5 text-sm text-slate-500">We use this to prioritize stories relevant to your role and industry.</p>
          <ProfileFields d={defaults} />
        </Card>
        <Card className="p-6">
          <h2 className="mb-5 font-semibold text-slate-900">2. What you want to hear about</h2>
          <InterestFields d={defaults} />
        </Card>
        <div className="flex justify-end">
          <SubmitButton size="lg" pendingText="Building your radar…">
            Show me my feed
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
