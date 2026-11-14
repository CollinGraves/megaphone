/** Activity-feed wording for `billing.*` events. Pure. */
import { planLabel } from "@/lib/plans";

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const every = (interval: unknown) => (interval === "year" ? " (annual)" : interval === "month" ? " (monthly)" : "");

export function describeBillingEvent(action: string, d: Record<string, unknown>): string {
  switch (action) {
    case "billing.checkout_started":
      return `started checkout for ${planLabel(s(d.plan))}${every(d.interval)}`;
    case "billing.checkout_completed":
      return `completed checkout${d.plan ? ` for ${planLabel(s(d.plan))}${every(d.interval)}` : ""}`;
    case "billing.upgraded":
      return `upgraded the workspace to ${planLabel(s(d.to))}${every(d.interval)}${d.status === "trialing" ? " with a free trial" : ""}`;
    case "billing.downgraded":
      return `moved the workspace from ${planLabel(s(d.from))} to ${planLabel(s(d.to))}`;
    case "billing.plan_changed":
      return `changed the plan to ${planLabel(s(d.to))}${every(d.interval)}`;
    case "billing.canceled":
      return `ended the ${planLabel(s(d.from))} subscription; the workspace is back on Free`;
    case "billing.status_changed":
      return d.status === "past_due" ? "missed a subscription payment (past due)" : `subscription status changed to ${s(d.status).replace(/_/g, " ")}`;
    case "billing.cancel_scheduled":
      return "set the subscription to cancel at the end of the billing period";
    case "billing.cancel_reverted":
      return "resumed the subscription (it will renew)";
    case "billing.payment_failed":
      return `had a payment fail${d.amount ? ` (${s(d.amount)})` : ""}`;
    case "billing.portal_opened":
      return "opened the billing portal";
    case "billing.plan_set_by_admin":
      return `set the plan to ${planLabel(s(d.to))}${d.comped ? " (complimentary)" : ""}`;
    default:
      return action.replace(/[._]/g, " ");
  }
}
