import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { requireWorkEmail } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create your free AI Radar" };
export const dynamic = "force-dynamic";

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
    />
  );
}
