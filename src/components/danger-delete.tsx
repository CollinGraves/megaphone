"use client";

import { useState, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Input } from "@/components/ui";
import type { ActionState } from "@/lib/utils";

/**
 * A permanent-delete form: the button only enables once the person types `expected` (a slug or email).
 * The server action re-checks the `confirm` field, so this is a guard against slips, not the only check.
 */
export function DangerDelete({
  action,
  expected,
  hidden,
  label,
  children,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  expected: string;
  hidden: Record<string, string>;
  label: string;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const id = `confirm-${expected.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <ActionForm action={action} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <label htmlFor={id} className="block text-sm text-slate-700">
        Type <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-semibold text-slate-900">{expected}</code> to confirm
      </label>
      <Input id={id} name="confirm" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
      {typed.trim() === expected ? (
        <SubmitButton variant="danger" size="sm" pendingText="Deleting…">
          {label}
        </SubmitButton>
      ) : (
        <button type="button" disabled className="inline-flex h-8 cursor-not-allowed items-center rounded-lg bg-red-600/40 px-3 text-sm font-medium text-white">
          {label}
        </button>
      )}
    </ActionForm>
  );
}
