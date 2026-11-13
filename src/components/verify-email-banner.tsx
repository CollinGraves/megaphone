"use client";

import { useState, useTransition } from "react";
import { MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth/client";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="mb-6 flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2">
        <MailCheck className="size-4 shrink-0" />
        Confirm <strong className="font-medium">{email}</strong> so your digest lands in your inbox, not spam.
      </span>
      <button
        type="button"
        disabled={pending || sent}
        className="shrink-0 font-medium text-sky-800 underline-offset-2 hover:underline disabled:no-underline disabled:opacity-70"
        onClick={() =>
          start(async () => {
            await authClient.sendVerificationEmail({ email, callbackURL: "/feed" });
            setSent(true);
          })
        }
      >
        {sent ? "Sent, check your inbox" : pending ? "Sending…" : "Resend confirmation"}
      </button>
    </div>
  );
}
