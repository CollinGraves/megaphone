"use client";

import { CheckCircle2 } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { IdeaFields } from "@/app/(app)/w/[slug]/ideas/_components/idea-fields";
import { Alert, Button, Field, Input } from "@/components/ui";
import type { ActionState } from "@/lib/utils";
import { submitIntakeIdea } from "./actions";

type Props = { token: string; orgName: string; domains: string[]; defaultName?: string; defaultEmail?: string };

export function IntakeForm(props: Props) {
  const [round, setRound] = useState(0);
  return <IntakeFormInner key={round} {...props} onAnother={() => setRound((r) => r + 1)} />;
}

function IntakeFormInner({ token, orgName, domains, defaultName, defaultEmail, onAnother }: Props & { onAnother: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitIntakeIdea, null);

  if (state?.ok) {
    return (
      <div className="py-6 text-center" role="status">
        <CheckCircle2 className="mx-auto size-10 text-radar-600" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Thanks — your idea is in!</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
          {orgName}’s AI team reviews every idea. {state.message ? <>We’ve sent a confirmation to <strong className="text-slate-900">{state.message}</strong> and will</> : "We’ll"}{" "}
          email you when they’ve made a decision.
        </p>
        <Button variant="secondary" className="mt-5" onClick={onAnother}>
          Submit another idea
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      // Submit in a transition so React doesn't reset the form: a rejected email keeps the idea text.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="token" value={token} />
      {/* Honeypot */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <IdeaFields />

      <section className="space-y-4 border-t border-slate-100 pt-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">About you</h3>
          <p className="mt-0.5 text-xs text-slate-500">So the AI team can follow up. We’ll only email you about this idea.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" htmlFor="intake-name">
            <Input id="intake-name" name="name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={defaultName} />
          </Field>
          <Field
            label="Work email"
            htmlFor="intake-email"
            hint={domains.length ? `Use your ${domains.map((d) => `@${d}`).join(" or ")} address.` : "Use your company email address."}
          >
            <Input id="intake-email" name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={defaultEmail} placeholder={domains[0] ? `name@${domains[0]}` : "name@company.com"} />
          </Field>
        </div>
      </section>

      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Your idea goes to {orgName}’s AI team only.</p>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Submitting…" : "Submit idea"}
        </Button>
      </div>
    </form>
  );
}
