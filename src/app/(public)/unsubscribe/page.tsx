import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card } from "@/components/ui";
import { unsubscribe } from "./actions";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const { u } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card className="p-6">
        <h1 className="text-lg font-semibold text-slate-900">Unsubscribe from the digest?</h1>
        <p className="mt-1 text-sm text-slate-600">You&apos;ll stop receiving {BRAND} emails. You can turn them back on in settings.</p>
        <ActionForm action={unsubscribe} className="mt-6">
          <input type="hidden" name="u" value={typeof u === "string" ? u : ""} />
          <SubmitButton variant="primary">Unsubscribe</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
