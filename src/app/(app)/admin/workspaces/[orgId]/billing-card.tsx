import { eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { db } from "@/db";
import { user, type Organization } from "@/db/schema";
import { billingConfigured, stripeDashboardUrl } from "@/lib/billing/server";
import { summarizeBilling } from "@/lib/billing/status";
import { formatUsd, formatDate } from "@/lib/utils";
import { mrrFor } from "@/lib/plans";

/** Staff view of a workspace's self-serve billing state, with links into the Stripe dashboard. */
export async function BillingCard({ org }: { org: Organization }) {
  const summary = summarizeBilling(org);
  const [creator] = org.createdById ? await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, org.createdById)).limit(1) : [];
  const mrr = summary.kind === "subscribed" && org.subscriptionStatus !== "trialing" ? mrrFor(org.plan, org.billingInterval) : 0;

  return (
    <Card>
      <CardHeader
        title="Billing"
        description={summary.kind === "managed" ? "Invoiced by North Labs" : summary.kind === "comped" ? "Complimentary (no Stripe subscription)" : "Self-serve via Stripe"}
        action={<Badge tone={summary.tone}>{summary.badge}</Badge>}
      />
      <CardBody>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <Row label="Plan">{summary.planName}</Row>
          {summary.detail ? <Row label="Status">{summary.detail}</Row> : null}
          <Row label="Stripe status">{org.subscriptionStatus ? <code className="text-xs">{org.subscriptionStatus}</code> : "—"}</Row>
          <Row label="Interval">{org.billingInterval === "year" ? "Annual" : org.billingInterval === "month" ? "Monthly" : "—"}</Row>
          <Row label="Period end">{org.currentPeriodEnd ? formatDate(org.currentPeriodEnd) : "—"}</Row>
          <Row label="Cancels at end">{org.cancelAtPeriodEnd ? "Yes" : "No"}</Row>
          <Row label="MRR (list)">{mrr ? formatUsd(mrr) : "—"}</Row>
          <Row label="Customer">
            <StripeLink id={org.stripeCustomerId} href={org.stripeCustomerId ? stripeDashboardUrl("customers", org.stripeCustomerId) : null} />
          </Row>
          <Row label="Subscription">
            <StripeLink id={org.stripeSubscriptionId} href={org.stripeSubscriptionId ? stripeDashboardUrl("subscriptions", org.stripeSubscriptionId) : null} />
          </Row>
          <Row label="Created">{creator ? `Self-serve by ${creator.name}` : org.provisionedById ? "Provisioned by North Labs" : "—"}</Row>
        </dl>
        {summary.hasLiveSubscription ? (
          <p className="mt-4 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200 ring-inset">
            This workspace pays through Stripe. Change its plan in Stripe (or let the customer use the billing portal); a manual plan change here is overwritten by the next
            subscription update.
          </p>
        ) : (
          <p className="mt-4 text-xs text-slate-500">
            Setting the plan to Team or Business above grants it without Stripe (complimentary).{!billingConfigured() ? " Online checkout isn’t configured in this environment." : ""}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-slate-900">{children}</dd>
    </>
  );
}

function StripeLink({ id, href }: { id: string | null; href: string | null }) {
  if (!id || !href) return <>—</>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-radar-700 hover:underline" title={id}>
      <span className="truncate">{id}</span> <ExternalLink className="size-3 shrink-0" aria-hidden />
    </a>
  );
}
