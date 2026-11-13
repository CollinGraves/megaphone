"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** Compact form for table rows: binds a server action and shows its error inline. */
export function InlineForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {state?.error ? (
        <p role="alert" className="basis-full text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
