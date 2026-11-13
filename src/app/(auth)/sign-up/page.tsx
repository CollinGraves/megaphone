import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Create your free AI Radar" };
export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next, email } = await searchParams;
  const nextPath = safeNextPath(next, "") || undefined;
  if (await getCurrentUser()) redirect(nextPath ?? "/feed");
  return <AuthForm mode="sign-up" next={nextPath} defaultEmail={typeof email === "string" ? email : undefined} />;
}
