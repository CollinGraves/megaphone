import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { db } from "@/db";
import { activityLog, organizations } from "@/db/schema";
import { billingConfigured } from "@/lib/billing/server";
import { isLiveStatus } from "@/lib/billing/sync";
import { mrrFor } from "@/lib/plans";
import { formatNumber, formatUsd } from "@/lib/utils";
import { daysAgo } from "../_lib/time";

/**
 * Self-serve business metrics for platform admins. MRR/ARR are computed from plan + interval list
 * prices (annual ÷ 12) for live, non-trial Stripe subscriptions — not from Stripe invoices, so
 * discounts and taxes aren't reflected.
 */
export async function SelfServeMetrics() {
  const since30 = daysAgo(30);
  const [paid, [created], [conversions]] = await Promise.all([
    db
      .select({
        plan: organizations.plan,
        interval: organizations.billingInterval,
        status: organizations.subscriptionStatus,
        subscriptionId: organizations.stripeSubscriptionId,
      })
      .from(organizations)
      .where(and(inArray(organizations.plan, ["team", "business", "pro"]), eq(organizations.status, "active"))),
    db
      .select({
        last30: sql<number>`count(*) filter (where ${organizations.createdAt} >= ${since30.toISOString()}::timestamptz)`.mapWith(Number),
        total: count(),
        free: sql<number>`count(*) filter (where ${organizations.plan} = 'trial')`.mapWith(Number),
      })
      .from(organizations)
      // Self-serve = not provisioned by North Labs (created from /workspaces/new or an assessment).
      .where(isNull(organizations.provisionedById)),
    db
      .select({
        last30: sql<number>`count(distinct ${activityLog.orgId}) filter (where ${activityLog.createdAt} >= ${since30.toISOString()}::timestamptz)`.mapWith(Number),
        total: sql<number>`count(distinct ${activityLog.orgId})`.mapWith(Number),
      })
      .from(activityLog)
      .where(and(eq(activityLog.action, "billing.upgraded"), sql`${activityLog.detail}->>'from' = 'trial'`)),
  ]);

  const byPlan = { team: { paying: 0, trialing: 0, comped: 0 }, business: { paying: 0, trialing: 0, comped: 0 } };
  let mrr = 0;
  for (const o of paid) {
    const bucket = byPlan[o.plan === "team" ? "team" : "business"];
    const live = Boolean(o.subscriptionId) && isLiveStatus(o.status);
    if (!live) bucket.comped++;
    else if (o.status === "trialing") bucket.trialing++;
    else {
      bucket.paying++;
      mrr += mrrFor(o.plan, o.interval);
    }
  }
  const paying = byPlan.team.paying + byPlan.business.paying;
  const breakdown = (b: { paying: number; trialing: number; comped: number }) =>
    [b.trialing ? `${b.trialing} trialing` : null, b.comped ? `${b.comped} comped` : null].filter(Boolean).join(" · ") || "No trials or comps";

  return (
    <Card className="mt-6">
      <CardHeader
        title="Self-serve billing"
        description={billingConfigured() ? "Stripe subscriptions at list price (annual ÷ 12). Excludes trials, comps and North Labs engagements." : "Stripe isn’t configured in this environment; only complimentary plans can exist."}
        action={
          <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline">
            Workspaces <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />
      <CardBody className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-5">
        <Metric label="MRR" value={formatUsd(mrr)} hint={`ARR ${formatUsd(mrr * 12)}`} />
        <Metric label="Team" value={formatNumber(byPlan.team.paying)} hint={breakdown(byPlan.team)} />
        <Metric label="Business" value={formatNumber(byPlan.business.paying)} hint={breakdown(byPlan.business)} />
        <Metric label="Self-serve · 30 days" value={formatNumber(created?.last30 ?? 0)} hint={`${formatNumber(created?.total ?? 0)} self-serve workspaces, ${formatNumber(created?.free ?? 0)} on Free`} />
        <Metric
          label="Free → paid · 30 days"
          value={formatNumber(conversions?.last30 ?? 0)}
          hint={`${formatNumber(conversions?.total ?? 0)} all time · ${formatNumber(paying)} paying now`}
        />
      </CardBody>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </div>
  );
}
