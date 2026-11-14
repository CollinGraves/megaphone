import { and, asc, eq } from "drizzle-orm";
import { ArrowRight, Check, Handshake } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeatureComparison, IntervalToggle, PlanCard, PricingGroup, SERVICES } from "@/components/billing/plans";
import { ButtonLink } from "@/components/ui";
import { db } from "@/db";
import { memberships, organizations } from "@/db/schema";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";
import { PLANS, isManaged, planRank, type BillingInterval, type PlanDefinition } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: `${BRAND} pricing. Free to start, $399 or $999 a month when you need more. Priced per workspace, not per seat.`,
  alternates: { canonical: "/pricing" },
};

const START_FREE = `/sign-up?src=pricing&next=${encodeURIComponent("/workspaces/new")}`;

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is Free actually free?",
    a: `Yes. Up to ${PLANS.free.initiativeLimit} active projects, unlimited teammates, no card and no time limit.`,
  },
  {
    q: "Is it per seat?",
    a: "No. One price per workspace, with as many people as you like. Pay yearly and get two months free.",
  },
  {
    q: "Is there a trial?",
    a: "Yes. Paid plans start with a free trial. Cancel before it ends and you pay nothing.",
  },
  {
    q: "What if I cancel?",
    a: "Your data stays. Paid features run to the end of the billing period, then the workspace moves to Free. Projects over the limit stay visible, but you can't add more until you archive some.",
  },
  {
    q: "Do I need North Labs?",
    a: "No. Every plan is self-serve. Hire North Labs only if you want help setting it up or running it.",
  },
  {
    q: "How do I pay?",
    a: "Card, through Stripe. Owners and admins handle invoices, plan changes and cancellation under Plan & billing. Need a purchase order? Contact us.",
  },
];

/** The workspace a signed-in visitor would upgrade: one they own or administer that isn't managed by North Labs. */
async function upgradeTarget(me: CurrentUser | null) {
  if (!me) return { kind: "signed_out" as const };
  const rows = await db
    .select({ slug: organizations.slug, name: organizations.name, plan: organizations.plan, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, me.id), eq(organizations.status, "active")))
    .orderBy(asc(organizations.createdAt));
  const manageable = rows.find((r) => (r.role === "owner" || r.role === "admin") && !isManaged(r.plan));
  if (manageable) return { kind: "manage" as const, ...manageable };
  const managed = rows.find((r) => isManaged(r.plan));
  if (managed) return { kind: "managed" as const, ...managed };
  if (rows.length) return { kind: "member" as const, ...rows[0] };
  return { kind: "no_workspace" as const };
}

export default async function PricingPage({ searchParams }: PageProps<"/pricing">) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const target = await upgradeTarget(me);
  const defaultInterval: BillingInterval = sp.interval === "year" ? "year" : "month";

  const cta = (plan: PlanDefinition, interval: BillingInterval): ReactNode => {
    const primary = plan.id === "team" ? "primary" : "secondary";
    if (plan.id === "free") {
      if (target.kind === "signed_out") return <ButtonLink href={START_FREE} variant="secondary" className="w-full">Start free</ButtonLink>;
      if (target.kind === "no_workspace") return <ButtonLink href="/workspaces/new" variant="secondary" className="w-full">Start free</ButtonLink>;
      return <ButtonLink href={`/w/${target.slug}`} variant="secondary" className="w-full">Open your workspace</ButtonLink>;
    }
    switch (target.kind) {
      case "signed_out":
        return <ButtonLink href={START_FREE} variant={primary} className="w-full">Start free, upgrade anytime</ButtonLink>;
      case "no_workspace":
        return <ButtonLink href="/workspaces/new" variant={primary} className="w-full">Create a workspace to upgrade</ButtonLink>;
      case "manage": {
        const current = planRank(target.plan) === planRank(plan.id);
        return (
          <ButtonLink href={`/w/${target.slug}/billing?interval=${interval}`} variant={primary} className="w-full">
            {current ? "Manage your plan" : planRank(target.plan) > planRank(plan.id) ? `Switch to ${plan.name}` : `Upgrade ${target.name}`}
          </ButtonLink>
        );
      }
      case "managed":
        return <p className="py-2 text-center text-sm text-slate-500">{target.name} is managed by North Labs.</p>;
      case "member":
        return <p className="py-2 text-center text-sm text-slate-500">Ask a workspace owner or admin to upgrade.</p>;
    }
  };

  return (
    <div className="bg-slate-50">
      <section className="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-slate-900 sm:text-4xl">Pricing</h1>
          <p className="mt-3 text-slate-600">Start free. Pay per workspace, not per seat. Change or cancel any time.</p>
        </div>

        <PricingGroup className="mt-10">
          <div className="mb-8 flex justify-center">
            <IntervalToggle defaultInterval={defaultInterval} />
          </div>
          <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
            {[PLANS.free, PLANS.team, PLANS.business].map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                featured={p.id === "team"}
                current={target.kind === "manage" && planRank(target.plan) === planRank(p.id)}
                cta={{ month: cta(p, "month"), year: cta(p, "year") }}
              />
            ))}
          </div>
        </PricingGroup>
        <p className="mt-6 text-center text-sm text-slate-500">
          USD, before tax. Paid plans start with a free trial.{" "}
          <Link href="#compare" className="font-medium text-radar-700 hover:underline">
            Compare every feature
          </Link>
        </p>
      </section>

      <section id="compare" className="mx-auto max-w-5xl scroll-mt-20 px-4 py-12 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Compare plans</h2>
        <p className="mt-1 text-sm text-slate-600">Every plan includes unlimited teammates.</p>
        <div className="mt-6">
          <FeatureComparison />
        </div>
      </section>

      <section className="bg-ink-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Want it done for you?</h2>
              <p className="mt-3 text-slate-300">North Labs built {BRAND}. We can set it up, fill it in and help build what&apos;s on the list. Optional, on any plan.</p>
              <ButtonLink href="/contact?from=pricing" variant="accent" size="lg" className="mt-6">
                <Handshake className="size-5" /> Talk to North Labs
              </ButtonLink>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {SERVICES.map((s) => (
                <div key={s.name} className="rounded-xl bg-white/5 p-5 ring-1 ring-white/10">
                  <h3 className="text-lg font-semibold">{s.name}</h3>
                  <p className="mt-1 text-sm text-slate-300">{s.summary}</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-200">
                    {s.points.map((pt) => (
                      <li key={pt} className="flex gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-radar-400" aria-hidden />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Questions</h2>
          <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                  {f.q}
                  <ArrowRight className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <p className="mt-2 text-sm text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <ButtonLink href={target.kind === "signed_out" ? START_FREE : target.kind === "no_workspace" ? "/workspaces/new" : "/feed"} size="lg">
              {target.kind === "signed_out" || target.kind === "no_workspace" ? "Start free" : "Back to the app"}
            </ButtonLink>
            <ButtonLink href="/contact?from=pricing_faq" variant="secondary" size="lg">
              Talk to North Labs
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
