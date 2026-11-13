import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { track } from "@/lib/tracking";
import { submitContactRequest } from "./actions";

export const metadata: Metadata = {
  title: "Talk to North Labs",
  description: "Get help prioritizing, building and measuring your company's AI initiatives.",
};

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const source = [params.from, params.story].filter((v) => typeof v === "string").join(":") || "contact_page";
  if (user && typeof params.from === "string") await track("cta_click", { userId: user.id, metadata: { source } });
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Turn AI news into business results</h1>
        <p className="mt-3 text-slate-600">
          North Labs works with leadership teams to decide where AI should go first, build it on the right platform, and
          prove the impact. Our clients run their entire AI portfolio in an AI Radar Workspace.
        </p>
        <ul className="mt-8 space-y-4">
          {[
            ["AI opportunity assessment", "A prioritized list of initiatives scored on value, feasibility and risk."],
            ["Platform-neutral delivery", "Claude, OpenAI, Copilot, Gemini or open-source models — whatever fits the problem."],
            ["Measured impact", "Hours saved, cost reduced and revenue generated, tracked month by month."],
            ["Data readiness", "A map of every system and dataset your initiatives depend on, and what's blocking access."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-radar-600" />
              <div>
                <div className="font-medium text-slate-900">{title}</div>
                <div className="text-sm text-slate-600">{body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-900">Talk to North Labs</h2>
        <p className="mt-1 text-sm text-slate-500">Tell us a little about what you&apos;re working on.</p>
        <ActionForm action={submitContactRequest} className="mt-6" resetOnSuccess>
          <input type="hidden" name="source" value={source} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={user?.name} required />
            </Field>
            <Field label="Work email" htmlFor="email">
              <Input id="email" name="email" type="email" defaultValue={user?.email} required />
            </Field>
          </div>
          <Field label="Company" htmlFor="company">
            <Input id="company" name="company" defaultValue={user?.company ?? undefined} />
          </Field>
          <Field label="What are you hoping to achieve with AI?" htmlFor="message">
            <Textarea id="message" name="message" rows={5} />
          </Field>
          <SubmitButton className="w-full" pendingText="Sending…">
            Request a conversation
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
