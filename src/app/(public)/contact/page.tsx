import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, Input, Textarea } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { track } from "@/lib/tracking";
import { submitContactRequest } from "./actions";
import { BRAND, SHOW_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Talk to North Labs",
  description: "Get help picking, building and measuring your company's AI projects.",
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
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Talk to North Labs</h1>
        <p className="mt-3 text-slate-600">
          North Labs is an AI consulting company for mid-size businesses. We help you pick the right AI projects, build them and
          measure what they give back. Our clients track their AI work in {BRAND}.
        </p>
        <ul className="mt-8 space-y-4">
          {[
            ["Know where to start", "A ranked list of AI projects, scored on value, effort and risk."],
            ["Any AI tool", "Claude, ChatGPT, Copilot, Gemini or free open models. Whatever fits best."],
            ["Results you can measure", "Hours saved, costs cut and sales added, tracked every month."],
            ["The data you need", "Which systems each project needs, and what's in the way."],
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
        <h2 className="text-lg font-semibold text-slate-900">{pitch ? `Send a question to ${SHOW_NAME}` : "Talk to North Labs"}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {pitch
            ? "Ask anything about making AI work at your company, or send an AI idea you want built live. Tell us the team it's for and the tools you already use. We'll leave your company's name out unless you say it's OK."
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
          <Field label="What do you want AI to help with?" htmlFor="message">
            <Textarea id="message" name="message" rows={5} />
          </Field>
          <SubmitButton className="w-full" pendingText="Sending…">
            Ask for a call
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
