"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { recordSignupContext } from "@/app/(auth)/actions";
import { authClient } from "@/lib/auth/client";
import { classifyEmail, emailDomain, guessCompanyName } from "@/lib/email-domains";
import type { SocialProviders } from "@/lib/auth/providers";
import { safeNextPath } from "@/lib/safe-redirect";
import { SsoButtons } from "./sso-buttons";
import { Alert, Button, Card, Checkbox, Field, Input } from "./ui";

export function AuthForm({
  mode,
  next,
  defaultEmail,
  requireWorkEmail = false,
  referral,
  source,
  providers,
  errorMessage,
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
  defaultEmail?: string;
  requireWorkEmail?: boolean;
  referral?: string;
  source?: string;
  providers: SocialProviders;
  errorMessage?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [allowPersonal, setAllowPersonal] = useState(false);
  const isSignUp = mode === "sign-up";

  const kind = useMemo(() => (email.includes("@") && email.split("@")[1]?.includes(".") ? classifyEmail(email) : null), [email]);
  const blocked = isSignUp && (kind === "disposable" || (kind === "personal" && (requireWorkEmail || !allowPersonal)));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setError(null);
    start(async () => {
      const result = isSignUp
        ? await authClient.signUp.email({ email: email.trim(), password, name, callbackURL: "/feed" })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Please try again.");
        return;
      }
      if (isSignUp) await recordSignupContext({ ref: referral, source });
      router.push(safeNextPath(next, isSignUp ? "/onboarding" : "/feed"));
      router.refresh();
    });
  }

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const newUserParams = new URLSearchParams({ src: source ?? "sso", ...(referral ? { ref: referral } : {}) });
  const ssoNewUserUrl = next ? safeNextPath(next, "/onboarding") : `/onboarding?${newUserParams.toString()}`;
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold text-slate-900">{isSignUp ? "Create your free AI Radar" : "Welcome back"}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isSignUp
          ? "Use your company email and we'll tailor your radar to your company's stack, deadlines and industry."
          : "Sign in to your feed and workspaces."}
      </p>
      <div className="mt-6">
        {errorMessage ? <Alert tone="error" className="mb-3">{errorMessage}</Alert> : null}
        <SsoButtons providers={providers} callbackURL={safeNextPath(next, "/feed")} newUserCallbackURL={ssoNewUserUrl} />
        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" /> or with your work email <span className="h-px flex-1 bg-slate-200" />
        </div>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label={isSignUp ? "Work email" : "Email"} htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isSignUp ? "you@company.com" : undefined}
            required
          />
        </Field>
        {isSignUp && kind === "work" ? (
          <p className="-mt-2 flex items-center gap-1.5 text-xs text-radar-700">
            <CheckCircle2 className="size-3.5" /> We&apos;ll tailor your radar for {guessCompanyName(emailDomain(email))}.
          </p>
        ) : null}
        {isSignUp && kind === "personal" ? (
          <div className="-mt-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                {requireWorkEmail ? (
                  <>AI Radar is for business teams. Please use your work email.</>
                ) : (
                  <>
                    <strong>Looks like a personal address.</strong> With your company email we tailor your radar to the
                    tools your company runs on, warn you about their deadlines, and let colleagues share it.
                  </>
                )}
              </div>
            </div>
            {!requireWorkEmail ? (
              <label className="mt-2 flex items-center gap-2 pl-6 text-xs">
                <Checkbox checked={allowPersonal} onChange={(e) => setAllowPersonal(e.target.checked)} />
                I don&apos;t have a work email, continue with this one
              </label>
            ) : null}
          </div>
        ) : null}
        {isSignUp && kind === "disposable" ? (
          <Alert tone="error" className="-mt-1">
            Temporary email addresses can&apos;t be used.
          </Alert>
        ) : null}
        {isSignUp ? (
          <Field label="Full name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
        ) : null}
        <Field label="Password" htmlFor="password" hint={isSignUp ? "At least 10 characters." : undefined}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={isSignUp ? 10 : undefined}
            required
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending || blocked}>
          {pending ? "Please wait…" : isSignUp ? "Create my free radar" : "Sign in"}
        </Button>
        {isSignUp ? (
          <p className="text-center text-xs text-slate-500">Free. No credit card. Unsubscribe from emails anytime.</p>
        ) : null}
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href={`/sign-in${nextQuery}`} className="font-medium text-radar-700 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to AI Radar?{" "}
            <Link href={`/sign-up${nextQuery}`} className="font-medium text-radar-700 hover:underline">
              Create a free account
            </Link>
          </>
        )}
      </p>
    </Card>
  );
}
