"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { classifyEmail, emailDomain, guessCompanyName } from "@/lib/email-domains";
import { cn } from "@/lib/utils";

/**
 * Email-first sign-up. Captures the work email on the landing page and continues to /sign-up with it
 * prefilled. Personal addresses get a nudge toward a work email before continuing.
 */
export function EmailCapture({ source, dark = false, className }: { source: string; dark?: boolean; className?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nudged, setNudged] = useState(false);
  const kind = useMemo(() => (email.includes("@") && email.split("@")[1]?.includes(".") ? classifyEmail(email) : null), [email]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // First attempt with a personal address: show the nudge instead of continuing.
    if (kind === "personal" && !nudged) {
      setNudged(true);
      return;
    }
    router.push(`/sign-up?email=${encodeURIComponent(email.trim())}&src=${encodeURIComponent(source)}`);
  }

  return (
    <form onSubmit={onSubmit} className={cn("w-full max-w-lg", className)}>
      <div className={cn("flex flex-col gap-2 rounded-xl p-1.5 sm:flex-row", dark ? "bg-white/10 ring-1 ring-white/15" : "bg-white ring-1 ring-slate-300")}>
        <label htmlFor={`email-${source}`} className="sr-only">
          Work email
        </label>
        <input
          id={`email-${source}`}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNudged(false);
          }}
          placeholder="you@company.com"
          className={cn(
            "h-11 min-w-0 flex-1 rounded-lg bg-transparent px-3 text-base focus:outline-none",
            dark ? "text-white placeholder:text-slate-400" : "text-slate-900 placeholder:text-slate-400",
          )}
        />
        <button
          type="submit"
          disabled={kind === "disposable"}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-radar-500 px-5 text-sm font-semibold text-ink-950 transition-colors hover:bg-radar-400 disabled:opacity-50"
        >
          {nudged ? "Continue anyway" : "Get my free radar"} <ArrowRight className="size-4" />
        </button>
      </div>
      <p className={cn("mt-2 min-h-5 text-sm", dark ? "text-slate-400" : "text-slate-500")} aria-live="polite">
        {kind === "work" ? (
          <span className={dark ? "text-radar-300" : "text-radar-700"}>
            Great, we&apos;ll tailor it for {guessCompanyName(emailDomain(email))}.
          </span>
        ) : kind === "personal" && nudged ? (
          <span className={dark ? "text-amber-300" : "text-amber-700"}>
            Tip: your work email gets you coverage tailored to your company and industry.
          </span>
        ) : kind === "disposable" ? (
          <span className={dark ? "text-red-300" : "text-red-700"}>Please use a permanent work email.</span>
        ) : (
          "Free. Use your work email. Unsubscribe anytime."
        )}
      </p>
    </form>
  );
}
