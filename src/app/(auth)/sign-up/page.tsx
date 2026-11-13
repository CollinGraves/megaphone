import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { requireWorkEmail } from "@/lib/auth";
import { socialProvidersEnabled } from "@/lib/auth/providers";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/safe-redirect";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Create your free ${BRAND}` };
export const dynamic = "force-dynamic";

const SSO_ERROR = "That sign-in didn't work. If you used a personal account, try your company Google or Microsoft account, or sign up with your work email.";
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next, "") || undefined;
  if (await getCurrentUser()) redirect(nextPath ?? "/feed");
  const source = one(params.src) ?? (one(params.utm_source) ? `utm:${one(params.utm_source)}` : undefined);
  return (
    <AuthForm
      mode="sign-up"
      next={nextPath}
      defaultEmail={one(params.email)}
      requireWorkEmail={requireWorkEmail()}
      referral={one(params.ref)}
      source={source}
      providers={socialProvidersEnabled()}
      errorMessage={one(params.error) ? SSO_ERROR : undefined}
    />
  );
}
