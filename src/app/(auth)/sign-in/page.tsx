import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { socialProvidersEnabled } from "@/lib/auth/providers";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, email, error } = await searchParams;
  const nextPath = safeNextPath(next, "") || undefined;
  if (await getCurrentUser()) redirect(nextPath ?? "/feed");
  return (
    <AuthForm
      mode="sign-in"
      next={nextPath}
      defaultEmail={typeof email === "string" ? email : undefined}
      providers={socialProvidersEnabled()}
      errorMessage={
        error
          ? "That sign-in didn't work. If you used a personal account, try your company Google or Microsoft account, or use your work email."
          : undefined
      }
    />
  );
}
