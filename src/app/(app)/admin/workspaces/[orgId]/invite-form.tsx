"use client";

import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/forms";
import { Alert, Input, Select } from "@/components/ui";
import { ORG_ROLES } from "@/lib/taxonomy";
import { CopyField } from "../../_components/copy-button";
import type { InviteState } from "../actions";

export function InviteForm({ action }: { action: (prev: InviteState, form: FormData) => Promise<InviteState> }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form ref={ref} action={formAction} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="email" type="email" required placeholder="name@client.com" aria-label="Email" className="sm:flex-1" autoComplete="off" />
        <Select name="role" defaultValue="editor" aria-label="Role" className="sm:w-36">
          {ORG_ROLES.map((r) => (
            <option key={r.slug} value={r.slug} title={r.description}>
              {r.label}
            </option>
          ))}
        </Select>
        <SubmitButton pendingText="Inviting…">Invite</SubmitButton>
      </div>
      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state?.ok ? (
        <div className="space-y-2">
          <Alert tone="success">{state.message}</Alert>
          {state.url ? <CopyField value={state.url} /> : null}
        </div>
      ) : null}
    </form>
  );
}
