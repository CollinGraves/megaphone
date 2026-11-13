"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { classifyEmail, emailDomain, guessCompanyName } from "@/lib/email-domains";

/**
 * Work-email gate for the full report. Continues to sign-up with the email prefilled and the claim
 * URL as `next`, so the new account lands on the report. Personal addresses get one nudge first.
 */
export function EmailGate({ claimPath }: { claimPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nudged, setNudged] = useState(false);
  const kind = useMemo(() => (email.includes("@") && email.split("@")[1]?.includes(".") ? classifyEmail(email) : null), [email]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (kind === "personal" && !nudged) {
      setNudged(true);
      return;
    }
    const params = new URLSearchParams({ email: email.trim(), src: "assessment", next: claimPath });
    router.push(`/sign-up?${params.toString()}`);
  }

  return (
    <form onSubmit={onSubmit}>
      <label htmlFor="gate-email" className="block text-sm font-medium text-slate-700">
        Work email
      </label>
      <input
        id="gate-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setNudged(false);
        }}
        placeholder="you@company.com"
        className="mt-1.5 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-radar-500 focus:outline-none focus:ring-2 focus:ring-radar-500/20"
      />
      <p className="mt-2 min-h-5 text-sm" aria-live="polite">
        {kind === "work" ? (
          <span className="text-radar-700">We&apos;ll tailor the report for {guessCompanyName(emailDomain(email))}.</span>
        ) : kind === "personal" && nudged ? (
          <span className="text-amber-700">
            Use your company email to get recommendations and Radar alerts tailored to your company&apos;s tools.
          </span>
        ) : kind === "disposable" ? (
          <span className="text-red-700">Please use a permanent work email.</span>
        ) : (
          <span className="text-slate-500">Free. No credit card.</span>
        )}
      </p>
      <button
        type="submit"
        disabled={kind === "disposable"}
        className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-radar-500 px-5 text-sm font-semibold text-ink-950 transition-colors hover:bg-radar-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-500 disabled:opacity-50"
      >
        {nudged ? "Continue anyway" : "Unlock my full report"} <ArrowRight className="size-4" aria-hidden />
      </button>
    </form>
  );
}
