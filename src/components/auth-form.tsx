"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth/client";
import { Alert, Button, Card, Field, Input } from "./ui";

function safeNext(next: string | null | undefined, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export function AuthForm({ mode, next, defaultEmail }: { mode: "sign-in" | "sign-up"; next?: string; defaultEmail?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isSignUp = mode === "sign-up";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    setError(null);
    start(async () => {
      const result = isSignUp
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(result.error.message ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(safeNext(next, isSignUp ? "/onboarding" : "/feed"));
      router.refresh();
    });
  }

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold text-slate-900">{isSignUp ? "Create your free AI Radar" : "Welcome back"}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isSignUp
          ? "A personalized feed and digest of the AI news that matters to your work."
          : "Sign in to your feed and workspaces."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {isSignUp ? (
          <Field label="Full name" htmlFor="name">
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
        ) : null}
        <Field label={isSignUp ? "Work email" : "Email"} htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required />
        </Field>
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
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
