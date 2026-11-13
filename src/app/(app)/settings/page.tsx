import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { ActionForm, SubmitButton } from "@/components/forms";
import { InterestFields, ProfileFields } from "@/components/preferences-fields";
import { StackCard } from "@/components/stack/stack-card";
import { Card, PageHeader } from "@/components/ui";
import { getStackContext } from "@/lib/graph/personalize";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { updateSettings } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser("/settings");
  const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1);
  const defaults = { ...user, ...prefs };
  const stack = await getStackContext(user);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHeader title="Settings & preferences" description={`Signed in as ${user.email}`} />
      <ActionForm action={updateSettings} className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-5 font-semibold text-slate-900">Profile</h2>
          <ProfileFields d={defaults} />
        </Card>
        <Card className="p-6">
          <h2 className="mb-5 font-semibold text-slate-900">Feed &amp; digest</h2>
          <InterestFields d={defaults} />
        </Card>
        <div className="flex justify-end">
          <SubmitButton>Save preferences</SubmitButton>
        </div>
      </ActionForm>
      {stack ? (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Company stack</h2>
          <StackCard ctx={stack} />
        </div>
      ) : null}
    </div>
  );
}
