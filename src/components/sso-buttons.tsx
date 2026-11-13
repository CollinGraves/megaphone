"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth/client";
import type { SocialProviders } from "@/lib/auth/providers";
import { cn } from "@/lib/utils";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
      <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
      <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
      <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
    </svg>
  );
}

const PROVIDERS = [
  { id: "google", label: "Google Workspace", Mark: GoogleMark },
  { id: "microsoft", label: "Microsoft 365", Mark: MicrosoftMark },
] as const;

export function SsoButtons({
  providers,
  callbackURL,
  newUserCallbackURL,
}: {
  providers: SocialProviders;
  callbackURL: string;
  newUserCallbackURL: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      {PROVIDERS.map(({ id, label, Mark }) => {
        const enabled = providers[id];
        return (
          <button
            key={id}
            type="button"
            disabled={!enabled || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const result = await authClient.signIn.social({
                  provider: id,
                  callbackURL,
                  newUserCallbackURL,
                  errorCallbackURL: "/sign-in?error=sso",
                });
                if (result?.error) setError(result.error.message ?? "Sign-in failed. Please try again.");
              })
            }
            className={cn(
              "relative flex h-10 w-full items-center gap-2.5 whitespace-nowrap rounded-lg border px-4 text-sm font-medium transition-colors",
              enabled ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400",
            )}
          >
            <span className={cn(!enabled && "opacity-50 grayscale")}>
              <Mark />
            </span>
            <span>Continue with {label}</span>
            {!enabled ? <span className="sr-only">(coming soon)</span> : null}
            {!enabled ? (
              <span className="ml-auto rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <span className="sm:hidden">Soon</span>
                <span className="hidden sm:inline">Coming soon</span>
              </span>
            ) : null}
          </button>
        );
      })}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
