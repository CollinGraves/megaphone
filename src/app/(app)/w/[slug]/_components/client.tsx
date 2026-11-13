"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useState, type ComponentProps, type ReactNode } from "react";
import { cn, type ActionState } from "@/lib/utils";

/* ───────────────────────────── Navigation ───────────────────────────── */

export type NavItem = { href: string; label: string; icon: ReactNode; count?: number; exact?: boolean };

export function WorkspaceNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-ink-900 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900",
            )}
          >
            <span className={cn("[&_svg]:size-4", active ? "text-radar-400" : "text-slate-400")}>{item.icon}</span>
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count ? (
              <span
                className={cn(
                  "ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-none",
                  active ? "bg-radar-500 text-ink-950" : "bg-amber-100 text-amber-800",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/* ───────────────────────────── Forms ───────────────────────────── */

/**
 * Compact form for inline row actions (dismiss, remove, status change). Shows the action's error
 * next to the controls instead of a full-width alert.
 */
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
    <form action={formAction} className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      {children}
      {state?.error ? (
        <span role="alert" className="text-xs text-red-700">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/** A <select> that submits its form as soon as the value changes. */
export function AutoSubmitSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
      className={cn(
        "h-8 rounded-md border border-slate-300 bg-white px-2 pr-7 text-xs text-slate-800 focus:border-radar-500 focus:outline-none focus:ring-2 focus:ring-radar-500/20",
        className,
      )}
    />
  );
}

export function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt("Copy this link", value);
        }
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {copied ? <Check className="size-3.5 text-radar-600" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}
