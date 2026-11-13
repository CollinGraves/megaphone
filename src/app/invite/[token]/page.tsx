import { CheckCircle2, Clock, MailWarning, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink, Card } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { findInvitation } from "@/lib/invitations";
import { ORG_ROLES, labelFrom } from "@/lib/taxonomy";
import { formatDate } from "@/lib/utils";
import { acceptInvite } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Workspace invitation", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [found, current] = await Promise.all([findInvitation(token), getCurrentUser()]);
  const next = `/invite/${encodeURIComponent(token)}`;

  if (!found) {
    return (
      <Shell icon={<XCircle className="size-6 text-red-500" />} title="Invitation not found">
        <p>This invitation link is invalid. Ask the person who invited you to send a new one.</p>
        <Footer signedIn={Boolean(current)} />
      </Shell>
    );
  }

  const { invitation, org, state } = found;
  const role = labelFrom(ORG_ROLES, invitation.role);

  if (state === "accepted") {
    return (
      <Shell icon={<CheckCircle2 className="size-6 text-radar-600" />} title="Invitation already accepted">
        <p>
          This invitation to <strong className="text-slate-900">{org.name}</strong> has already been used.
        </p>
        {current ? (
          <ButtonLink href={`/w/${org.slug}`} className="mt-4 w-full">
            Open workspace
          </ButtonLink>
        ) : (
          <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/w/${org.slug}`)}`} className="mt-4 w-full">
            Sign in
          </ButtonLink>
        )}
      </Shell>
    );
  }

  if (state === "revoked" || state === "expired") {
    return (
      <Shell icon={<Clock className="size-6 text-amber-500" />} title={state === "expired" ? "Invitation expired" : "Invitation revoked"}>
        <p>
          This invitation to <strong className="text-slate-900">{org.name}</strong> {state === "expired" ? `expired on ${formatDate(invitation.expiresAt)}` : "is no longer valid"}. Ask a workspace admin to
          send you a new one.
        </p>
        <Footer signedIn={Boolean(current)} />
      </Shell>
    );
  }

  const intro = (
    <p>
      You’ve been invited to join <strong className="text-slate-900">{org.name}</strong> on AI Radar as{" "}
      <strong className="text-slate-900">{role.toLowerCase()}</strong> — the single source of truth for the company’s AI initiatives.
    </p>
  );

  if (!current) {
    const signUp = `/sign-up?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`;
    const signIn = `/sign-in?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invitation.email)}`;
    return (
      <Shell title={`Join ${org.name}`}>
        {intro}
        <p className="mt-2">
          The invitation was sent to <strong className="text-slate-900">{invitation.email}</strong>. Create an account or sign in with that email to accept it.
        </p>
        <div className="mt-5 space-y-2">
          <ButtonLink href={signUp} className="w-full">
            Create account
          </ButtonLink>
          <ButtonLink href={signIn} variant="secondary" className="w-full">
            I already have an account
          </ButtonLink>
        </div>
      </Shell>
    );
  }

  if (current.email.toLowerCase() !== invitation.email) {
    return (
      <Shell icon={<MailWarning className="size-6 text-amber-500" />} title="Wrong account">
        {intro}
        <p className="mt-2">
          This invitation was sent to <strong className="text-slate-900">{invitation.email}</strong>, but you’re signed in as{" "}
          <strong className="text-slate-900">{current.email}</strong>. Sign out and sign in with the invited email to accept it.
        </p>
        <div className="mt-4 rounded-lg border border-slate-200">
          <SignOutButton className="text-center font-medium" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={`Join ${org.name}`}>
      {intro}
      <ActionForm action={acceptInvite} className="mt-5 space-y-3">
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="w-full" pendingText="Joining…">
          Accept invitation
        </SubmitButton>
      </ActionForm>
      <p className="mt-3 text-center text-xs text-slate-500">Signed in as {current.email}</p>
    </Shell>
  );
}

function Shell({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-12">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md p-6">
        {icon ? <div className="mb-3">{icon}</div> : null}
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <div className="mt-2 text-sm leading-relaxed text-slate-600">{children}</div>
      </Card>
    </div>
  );
}

function Footer({ signedIn }: { signedIn: boolean }) {
  return (
    <p className="mt-4 text-sm">
      <Link href={signedIn ? "/feed" : "/"} className="font-medium text-radar-700 hover:underline">
        {signedIn ? "Go to your feed" : "Learn about AI Radar"}
      </Link>
    </p>
  );
}
