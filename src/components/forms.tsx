"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Alert, Button } from "./ui";

/** Pending state for ActionForm, which submits via a transition (useFormStatus can't see it). */
const ActionPendingContext = createContext(false);

function usePending() {
  const { pending } = useFormStatus();
  const actionPending = useContext(ActionPendingContext);
  return pending || actionPending;
}

export function SubmitButton({
  children,
  pendingText,
  variant,
  size,
  className,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
}) {
  const pending = usePending();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} className={className} name={name} value={value}>
      {pending ? (pendingText ?? "Saving…") : children}
    </Button>
  );
}

/**
 * A <form> bound to a server action via useActionState, with inline error/success messaging.
 * Server actions should have the signature (prev: ActionState, form: FormData) => Promise<ActionState>.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  successMessage,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      // Submit inside a transition instead of via the form action so React doesn't auto-reset
      // the form: if the server rejects the input, the user's values stay put.
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
      className={cn("space-y-4", className)}
    >
      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state?.ok && (state.message || successMessage) ? (
        <Alert tone="success">{state.message ?? successMessage}</Alert>
      ) : null}
      <ActionPendingContext.Provider value={isPending}>{children}</ActionPendingContext.Provider>
    </form>
  );
}

/** Toggleable chips backed by checkboxes, so they submit with a normal form. */
export function ChipGroup({
  name,
  options,
  defaultValue = [],
  className,
}: {
  name: string;
  options: readonly { slug: string; label: string; description?: string }[];
  defaultValue?: string[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <label key={o.slug} className="cursor-pointer" title={o.description}>
          <input type="checkbox" name={name} value={o.slug} defaultChecked={defaultValue.includes(o.slug)} className="peer sr-only" />
          <span className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors peer-checked:border-radar-600 peer-checked:bg-radar-50 peer-checked:text-radar-900 peer-focus-visible:ring-2 peer-focus-visible:ring-radar-500 hover:border-slate-400">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Button that asks for confirmation before submitting its parent form. */
export function ConfirmSubmit({
  children,
  message,
  variant = "ghost",
  size = "sm",
  className,
}: {
  children: ReactNode;
  message: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  const pending = usePending();
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </Button>
  );
}
