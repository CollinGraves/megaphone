import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { applySignupContext } from "@/lib/signup-context";

/**
 * Google/Microsoft sign-ups land here first so we can record where they came from (src, ref).
 * There's no separate setup step any more: everyone goes on to their workspace (or creates one).
 */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser("/onboarding");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  if (one(sp.src) || one(sp.ref)) await applySignupContext(user, { source: one(sp.src), ref: one(sp.ref) });
  redirect("/home");
}
