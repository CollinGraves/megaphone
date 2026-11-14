import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { track } from "@/lib/tracking";
import { submitContactRequest } from "./actions";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Talk to North Labs",
  description: "Get help prioritizing, building and measuring your company's AI initiatives.",
};

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const params = await searchParams;
  const user = await getCurrentUser();
  // e.g. "onboarding_stalled:acme", "billing:acme:business", "story:<slug>"
  const source =
    [params.from, params.story, params.episode, params.workspace, params.plan]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map((v) => v.replace(/[^\w.:\-]/g, "").slice(0, 80))
      .join(":") || "contact_page";
  const pitch = params.from === "show" && !params.episode;
  if (user && typeof params.from === "string") await track("cta_click", { userId: user.id, metadata: { source } });
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 sm:px-6 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Turn AI news into business results</h1>
        <p className="mt-3 text-slate-600">
          North Labs works with leadership teams to decide where AI should go first, build it on the right platform, and
          prove the impact. Our clients run their entire AI portfolio in an {BRAND} Workspace.
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
        <h2 className="text-lg font-semibold text-slate-900">{pitch ? "Pitch an idea for Build it live" : "Talk to North Labs"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {pitch
            ? "Describe the problem, the team it's for and the tools you already use. We may build it on the show (we'll leave your company's name out unless you say otherwise)."
            : "Tell us a little about what you're working on."}
        </p>
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
