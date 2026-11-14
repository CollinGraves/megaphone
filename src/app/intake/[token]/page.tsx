import { and, eq } from "drizzle-orm";
import { ArrowRight, Clock, Lightbulb, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RadarMark } from "@/components/logo";
import { Card } from "@/components/ui";
import { db } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { hasFeature } from "@/lib/plans";
import { IntakeForm } from "./intake-form";
import { TOKEN_RE } from "./token";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Unknown, malformed or disabled tokens all 404 the same way: the page never reveals whether a workspace exists. */
const findIntakeOrg = cache(async (token: string) => {
  if (!TOKEN_RE.test(token)) return null;
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, plan: organizations.plan, intakeAllowedDomains: organizations.intakeAllowedDomains })
    .from(organizations)
    .where(and(eq(organizations.intakeToken, token), eq(organizations.status, "active")))
    .limit(1);
  // The intake link is a paid feature: a workspace that downgraded keeps its token, but the link is paused.
  if (!org || !hasFeature(org.plan, "intake_link")) return null;
  return org;
});

export async function generateMetadata({ params }: PageProps<"/intake/[token]">): Promise<Metadata> {
  const { token } = await params;
  const org = await findIntakeOrg(token);
  // 404 here too: letting the page throw notFound() while metadata is still resolving errors in dev.
  if (!org) notFound();
  return {
    title: `Submit an AI idea to ${org.name}`,
    robots: { index: false, follow: false },
    // Keep the secret token out of Referer headers on outbound links.
    referrer: "same-origin",
  };
}

const STEPS = [
  { icon: Lightbulb, text: "Describe a task or process AI could help with" },
  { icon: Clock, text: "Give a rough sense of how much time it takes today" },
  { icon: Sparkles, text: "The AI team reviews it and emails you the outcome" },
] as const;

export default async function IntakePage({ params }: PageProps<"/intake/[token]">) {
  const { token } = await params;
  const org = await findIntakeOrg(token);
  if (!org) notFound();

  const current = await getCurrentUser();
  const isMember = current
    ? Boolean(
        (
          await db
            .select({ userId: memberships.userId })
            .from(memberships)
            .where(and(eq(memberships.orgId, org.id), eq(memberships.userId, current.id)))
            .limit(1)
        )[0],
      )
    : false;
  const initials = org.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-xs font-semibold text-white" aria-hidden>
            {initials}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{org.name} · AI ideas</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-radar-700">AI idea intake</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Submit an AI idea to {org.name}’s AI team</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
            Know a task that eats hours every week, or a process that’s slow and error-prone? You’re closest to the work — tell us where AI could help. No account needed.
          </p>
          <ol className="mt-5 grid gap-2 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, text }, i) => (
              <li key={text} className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-radar-50 text-radar-700 ring-1 ring-radar-200">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span>
                  <span className="sr-only">Step {i + 1}: </span>
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {isMember ? (
          <div className="mb-5 flex flex-col gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:flex-row sm:items-center sm:justify-between">
            <span>You’re a member of the {org.name} workspace. Submit from the workspace to follow your idea’s status there.</span>
            <Link href={`/w/${org.slug}/ideas/new`} className="inline-flex shrink-0 items-center gap-1 font-medium text-sky-900 underline-offset-2 hover:underline">
              Open the in-app form <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : null}

        <Card className="p-5 sm:p-7">
          <IntakeForm
            token={token}
            orgName={org.name}
            domains={org.intakeAllowedDomains}
            defaultName={current?.name}
            defaultEmail={current?.email}
          />
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <RadarMark className="size-4" /> Powered by {BRAND} by North Labs
        </p>
      </main>
    </div>
  );
}
