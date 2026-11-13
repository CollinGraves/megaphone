import { and, count, eq, isNull } from "drizzle-orm";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CreditCard, Handshake, Lock, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { IntervalToggle, PlanCard, PricingGroup, SERVICES } from "@/components/billing/plans";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Badge, ButtonLink, Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { db } from "@/db";
import { initiatives, memberships } from "@/db/schema";
import { initiativeUsage } from "@/lib/billing/entitlements";
import { billingConfigured, stripeClient } from "@/lib/billing/server";
import { summarizeBilling } from "@/lib/billing/status";
import { trialDays, trialEligible } from "@/lib/billing/sync";
import { FEATURES, FEATURE_LABELS, PLANS, hasFeature, planFor, planRank, type BillingInterval, type Feature, type PlanDefinition } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { openBillingPortal, startCheckout } from "./actions";

export const metadata: Metadata = { title: "Plan & billing" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function BillingPage({ params, searchParams }: PageProps<"/w/[slug]/billing">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  if (!ctx.can("billing:manage")) notFound();
  const { org } = ctx;

  const [[active], [members]] = await Promise.all([
    db.select({ n: count() }).from(initiatives).where(and(eq(initiatives.orgId, org.id), isNull(initiatives.archivedAt))),
    db.select({ n: count() }).from(memberships).where(eq(memberships.orgId, org.id)),
  ]);
  const plan = planFor(org.plan);
  const summary = summarizeBilling(org);
  const usage = initiativeUsage(plan.initiativeLimit, active?.n ?? 0);
  const configured = billingConfigured();
  const portalAvailable = summary.canOpenPortal && stripeClient() != null;
  const trial = trialEligible(org) ? trialDays() : 0;
  const defaultInterval: BillingInterval = one(sp.interval) === "year" || org.billingInterval === "year" ? "year" : "month";
  const upgradeFeature = FEATURES.find((f) => f === one(sp.upgrade)) as Feature | undefined;
  const checkout = one(sp.checkout);
  const contactHref = (planId?: string) => `/contact?from=billing&workspace=${encodeURIComponent(org.slug)}${planId ? `&plan=${planId}` : ""}`;
  const hidden = <input type="hidden" name="slug" value={org.slug} />;

  const portalButton = (label: ReactNode, variant: "primary" | "secondary" = "secondary") => (
    <ActionForm action={openBillingPortal} className="space-y-2">
      {hidden}
      <SubmitButton variant={variant} pendingText="Opening Stripe…" className="w-full sm:w-auto">
        {label}
      </SubmitButton>
    </ActionForm>
  );

  /** Call-to-action for a plan card at one interval. */
  const ctaFor = (p: PlanDefinition, interval: BillingInterval): ReactNode => {
    const isCurrent = p.id === plan.id;
    if (p.id === "free") {
      if (isCurrent) return <CurrentPlanButton />;
      return summary.hasLiveSubscription && portalAvailable ? (
        <PortalCta slug={org.slug} label="Downgrade in billing portal" />
      ) : (
        <p className="py-2 text-center text-xs text-slate-500">
          {summary.kind === "comped" ? "Contact North Labs to change a complimentary plan." : "Cancel your paid plan to return to Free."}
        </p>
      );
    }
    if (isCurrent && (summary.kind === "comped" || org.billingInterval === interval || !summary.hasLiveSubscription)) return <CurrentPlanButton />;
    const label = isCurrent
      ? `Switch to ${interval === "year" ? "annual" : "monthly"} billing`
      : planRank(p.id) > planRank(org.plan)
        ? `Upgrade to ${p.name}`
        : `Switch to ${p.name}`;
    if (!configured) {
      return (
        <ButtonLink href={contactHref(p.id)} variant={p.id === "team" ? "primary" : "secondary"} className="w-full">
          Contact us to upgrade
        </ButtonLink>
      );
    }
    return (
      <ActionForm action={startCheckout} className="space-y-2">
        {hidden}
        <input type="hidden" name="plan" value={p.id} />
        <input type="hidden" name="interval" value={interval} />
        <SubmitButton variant={p.id === "team" ? "primary" : "secondary"} pendingText="Opening Stripe…" className="w-full">
          {summary.hasLiveSubscription ? label : trial > 0 ? `Start ${trial}-day free trial` : label}
        </SubmitButton>
      </ActionForm>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Plan & billing"
        description={
          summary.kind === "managed"
            ? `${org.name} is managed by North Labs.`
            : "Choose the plan that fits your AI portfolio. Upgrade, switch or cancel any time — no services required."
        }
      />

      {checkout === "success" ? (
        <Alert tone="success" className="flex gap-2">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>
            {summary.kind === "subscribed"
              ? `You’re on ${plan.name}. Thanks for subscribing!`
              : "Payment received. We’re activating your plan — this usually takes a few seconds. Refresh the page if it hasn’t updated."}
          </span>
        </Alert>
      ) : checkout === "canceled" ? (
        <Alert tone="neutral">Checkout canceled. You haven’t been charged.</Alert>
      ) : null}

      {upgradeFeature && !hasFeature(org.plan, upgradeFeature) && summary.kind !== "managed" ? (
        <Alert tone="neutral" className="flex gap-2 border-violet-200 bg-violet-50 text-violet-950">
          <Lock className="mt-0.5 size-4 shrink-0 text-violet-700" />
          <span>
            <strong>{FEATURE_LABELS[upgradeFeature].name}</strong> is included in the{" "}
            {(PLANS.team.features as readonly string[]).includes(upgradeFeature) ? "Team and Business plans" : "Business plan"}. Pick a plan below to unlock it.
          </span>
        </Alert>
      ) : null}

      {summary.pastDue ? (
        <Alert tone="error" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Your last payment failed.</strong> Update your payment method to keep {plan.name} features. Stripe will retry automatically.
            </span>
          </span>
          {portalAvailable ? <div className="shrink-0">{portalButton("Update payment method", "primary")}</div> : null}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5 [&>*]:min-w-0">
        <Card className="lg:col-span-3">
          <CardHeader title="Current plan" action={<Badge tone={summary.tone}>{summary.badge}</Badge>} />
          <CardBody className="space-y-4">
            <div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">{summary.planName}</div>
              <p className="mt-1 text-sm text-slate-600">{summary.detail ?? plan.tagline}</p>
            </div>
            {summary.kind === "managed" ? (
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={contactHref()} variant="secondary">
                  <Handshake className="size-4" /> Contact your North Labs team
                </ButtonLink>
              </div>
            ) : portalAvailable ? (
              <div className="space-y-2">
                {portalButton(
                  <>
                    <CreditCard className="size-4" /> Manage billing
                  </>,
                )}
                <p className="text-xs text-slate-500">Update your card, download invoices, switch plans or cancel in the Stripe billing portal.</p>
              </div>
            ) : summary.kind === "comped" ? (
              <p className="text-xs text-slate-500">Questions about your plan? Contact North Labs.</p>
            ) : !configured ? (
              <p className="text-xs text-slate-500">
                Online checkout isn’t switched on yet.{" "}
                <Link href={contactHref()} className="font-medium text-radar-700 hover:underline">
                  Contact us
                </Link>{" "}
                and we’ll upgrade your workspace.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Usage" description={`${members?.n ?? 0} member${members?.n === 1 ? "" : "s"} · teammates are unlimited on every plan`} />
          <CardBody className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-slate-900">Active initiatives</span>
                <span className="tabular-nums text-slate-700">
                  <span className="font-semibold text-slate-900">{usage.used}</span>
                  {usage.limit != null ? ` / ${usage.limit}` : " · unlimited"}
                </span>
              </div>
              {usage.limit != null ? (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={usage.limit} aria-valuenow={usage.used} aria-label="Initiatives used">
                    <div
                      className={cn("h-full rounded-full", usage.atLimit ? "bg-amber-500" : "bg-radar-500")}
                      style={{ width: `${Math.max(usage.ratio * 100, usage.used ? 4 : 0)}%` }}
                    />
                  </div>
                  <p className={cn("mt-1.5 text-xs", usage.atLimit ? "text-amber-800" : "text-slate-500")}>
                    {usage.atLimit
                      ? `You’ve reached the ${plan.name} limit. Upgrade or archive an initiative to add more.`
                      : `${usage.remaining} more before you reach the ${plan.name} limit. Archived initiatives don’t count.`}
                  </p>
                </>
              ) : null}
            </div>
            <ul className="space-y-1.5 border-t border-slate-100 pt-4 text-sm">
              {FEATURES.map((f) => {
                const on = hasFeature(org.plan, f);
                return (
                  <li key={f} className={cn("flex items-start gap-2", on ? "text-slate-800" : "text-slate-500")}>
                    {on ? <Check className="mt-0.5 size-4 shrink-0 text-radar-600" aria-label="Included" /> : <Lock className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-label="Not included" />}
                    <span>
                      {FEATURE_LABELS[f].name}
                      {!on ? <span className="ml-1 text-xs text-slate-400">({(PLANS.team.features as readonly string[]).includes(f) ? "Team" : "Business"})</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>

      {summary.kind === "managed" ? (
        <Card>
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Sparkles className="mt-0.5 size-5 shrink-0 text-radar-600" />
              <div>
                <h2 className="font-semibold text-slate-900">Managed by North Labs</h2>
                <p className="mt-0.5 text-sm text-slate-600">
                  Every feature is included and your North Labs team works alongside you. There’s nothing to buy here — talk to your North Labs contact about changes to your agreement.
                </p>
              </div>
            </div>
            <ButtonLink href={contactHref()} variant="secondary" className="shrink-0">
              Talk to North Labs
            </ButtonLink>
          </CardBody>
        </Card>
      ) : (
        <section aria-labelledby="plans-heading">
          <PricingGroup>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="plans-heading" className="text-base font-semibold text-slate-900">
                  Plans
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Per workspace, not per seat.{" "}
                  {trial > 0 && configured && !summary.hasLiveSubscription ? `Paid plans start with a ${trial}-day free trial. ` : ""}
                  <Link href="/pricing#compare" className="font-medium text-radar-700 hover:underline">
                    Compare all features
                  </Link>
                </p>
              </div>
              <IntervalToggle defaultInterval={defaultInterval} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[PLANS.free, PLANS.team, PLANS.business].map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  current={p.id === plan.id}
                  featured={p.id === "team" && plan.id === "free"}
                  cta={{ month: ctaFor(p, "month"), year: ctaFor(p, "year") }}
                  note={
                    p.id !== "free" && p.id === plan.id && summary.kind === "comped"
                      ? "Complimentary from North Labs"
                      : p.id !== "free" && summary.hasLiveSubscription && p.id !== plan.id
                        ? "Changes are prorated in the billing portal."
                        : undefined
                  }
                />
              ))}
            </div>
          </PricingGroup>
        </section>
      )}

      <section aria-labelledby="services-heading" className="rounded-xl bg-ink-900 p-5 text-white sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-radar-400">The easy button</div>
            <h2 id="services-heading" className="mt-1 text-lg font-semibold">
              Want North Labs to set it up or run it with you?
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Entirely optional. Our consultants can launch your portfolio for you or work inside your workspace every week.
            </p>
          </div>
          <ButtonLink href={contactHref()} variant="accent" className="shrink-0">
            Talk to North Labs <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <div key={s.name} className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <h3 className="font-semibold">{s.name}</h3>
              <p className="mt-0.5 text-sm text-slate-300">{s.summary}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-slate-200">
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
      </section>
    </div>
  );
}

function PortalCta({ slug, label }: { slug: string; label: string }) {
  return (
    <ActionForm action={openBillingPortal}>
      <input type="hidden" name="slug" value={slug} />
      <SubmitButton variant="secondary" pendingText="Opening Stripe…" className="w-full">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

function CurrentPlanButton() {
  return (
    <span className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500">
      <Check className="size-4" /> Current plan
    </span>
  );
}
