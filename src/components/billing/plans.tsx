import { Check, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { FEATURE_LABELS, PLANS, annualSavings, monthlyEquivalent, type BillingInterval, type Feature, type PlanDefinition } from "@/lib/plans";
import { cn, formatUsd } from "@/lib/utils";

/*
 * Plan cards, the monthly/annual toggle and the feature comparison, shared by the public pricing page
 * and the workspace billing page. The toggle is two radio buttons; everything that depends on the
 * interval is rendered twice and shown/hidden with CSS (`group/pricing` + :has), so it works
 * without client JavaScript and forms can submit the interval as a button value.
 */

const ANNUAL_ID = "pricing-interval-year";

/** Wrap the toggle and everything interval-dependent in this. Only one per page. */
export function PricingGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("group/pricing", className)}>{children}</div>;
}

export function IntervalToggle({ defaultInterval = "month", className }: { defaultInterval?: BillingInterval; className?: string }) {
  const option = "relative cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium text-slate-600 transition-colors has-checked:bg-white has-checked:text-slate-900 has-checked:shadow-xs has-focus-visible:ring-2 has-focus-visible:ring-radar-500";
  return (
    <fieldset className={cn("inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1", className)}>
      <legend className="sr-only">Billing interval</legend>
      <label className={option}>
        <input type="radio" name="pricing-interval" value="month" defaultChecked={defaultInterval === "month"} className="sr-only" />
        Monthly
      </label>
      <label className={option}>
        <input id={ANNUAL_ID} type="radio" name="pricing-interval" value="year" defaultChecked={defaultInterval === "year"} className="sr-only" />
        Annual <span className="ml-1 rounded bg-radar-100 px-1.5 py-0.5 text-[11px] font-semibold text-radar-800">2 months free</span>
      </label>
    </fieldset>
  );
}

/** Renders `month` or `year` depending on the toggle (both are in the HTML). */
export function ByInterval({ month, year, className }: { month: ReactNode; year: ReactNode; className?: string }) {
  return (
    <>
      <div className={cn("group-has-[#pricing-interval-year:checked]/pricing:hidden", className)}>{month}</div>
      <div className={cn("hidden group-has-[#pricing-interval-year:checked]/pricing:block", className)}>{year}</div>
    </>
  );
}

function Price({ plan, interval }: { plan: PlanDefinition; interval: BillingInterval }) {
  if (plan.monthlyPrice == null) return <div className="text-2xl font-semibold tracking-tight text-slate-900">Custom</div>;
  if (plan.monthlyPrice === 0) {
    return (
      <div>
        <span className="text-3xl font-semibold tracking-tight text-slate-900">$0</span>
        <span className="ml-1 text-sm text-slate-500">forever</span>
        <p className="mt-1 text-xs text-slate-500">No card required</p>
      </div>
    );
  }
  const perMonth = monthlyEquivalent(plan, interval) ?? 0;
  return (
    <div>
      <span className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatUsd(perMonth)}</span>
      <span className="ml-1 text-sm text-slate-500">/ month</span>
      <p className="mt-1 text-xs text-slate-500">
        {interval === "year" && plan.annualPrice != null ? (
          <>
            Billed {formatUsd(plan.annualPrice)} a year ·{" "}
            <span className="font-medium text-radar-700">save {formatUsd(annualSavings(plan.id as "team" | "business"))}</span>
          </>
        ) : (
          "Billed monthly · per workspace"
        )}
      </p>
    </div>
  );
}

export function PlanCard({
  plan,
  cta,
  current = false,
  featured = false,
  note,
}: {
  plan: PlanDefinition;
  /** Call-to-action per interval (same node for both is fine). */
  cta: { month: ReactNode; year: ReactNode };
  current?: boolean;
  featured?: boolean;
  note?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-white p-5 shadow-xs sm:p-6",
        featured ? "border-radar-500 ring-1 ring-radar-500" : "border-slate-200",
        current && "border-ink-900 ring-1 ring-ink-900",
      )}
    >
      {current ? (
        <span className="absolute -top-2.5 left-5 rounded-full bg-ink-900 px-2.5 py-0.5 text-xs font-semibold text-white">Current plan</span>
      ) : featured ? (
        <span className="absolute -top-2.5 left-5 rounded-full bg-radar-500 px-2.5 py-0.5 text-xs font-semibold text-ink-950">Most popular</span>
      ) : null}
      <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
      <p className="mt-1 min-h-10 text-sm text-slate-600">{plan.tagline}</p>
      <div className="mt-4 min-h-[4.5rem]">
        <ByInterval month={<Price plan={plan} interval="month" />} year={<Price plan={plan} interval="year" />} />
      </div>
      <div className="mt-4">
        <ByInterval month={cta.month} year={cta.year} />
      </div>
      {note ? <div className="mt-2 text-xs text-slate-500">{note}</div> : null}
      <ul className="mt-5 space-y-2 border-t border-slate-100 pt-5 text-sm text-slate-700">
        {plan.highlights.map((h) => (
          <li key={h} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-radar-600" aria-hidden />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BASE_ROWS: { label: string; free: ReactNode; team: ReactNode; business: ReactNode }[] = [
  { label: "AI initiatives", free: "Up to 5", team: "Up to 25", business: "Unlimited" },
  { label: "Teammates", free: "Unlimited", team: "Unlimited", business: "Unlimited" },
  { label: "Prioritization & impact tracking", free: true, team: true, business: true },
  { label: "Systems & data dependencies", free: true, team: true, business: true },
  { label: "Radar alerts tied to your stack", free: true, team: true, business: true },
  { label: "In-app idea submissions & triage", free: true, team: true, business: true },
  { label: "AI use-case register & risk classification", free: true, team: true, business: true },
];

const FEATURE_ROWS: Feature[] = ["intake_link", "export_csv", "mcp_workspace", "mcp_write", "governance_workflow", "governance_export"];

function Cell({ value }: { value: ReactNode }) {
  if (value === true) return <Check className="mx-auto size-4 text-radar-600" aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto size-4 text-slate-300" aria-label="Not included" />;
  return <span className="text-sm text-slate-800">{value}</span>;
}

export function FeatureComparison() {
  const has = (plan: PlanDefinition, f: Feature) => (plan.features as readonly string[]).includes(f);
  const rows = [
    ...BASE_ROWS,
    ...FEATURE_ROWS.map((f) => ({ label: FEATURE_LABELS[f].name, hint: FEATURE_LABELS[f].description, free: has(PLANS.free, f), team: has(PLANS.team, f), business: has(PLANS.business, f) })),
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">Feature comparison</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Feature
            </th>
            {[PLANS.free, PLANS.team, PLANS.business].map((p) => (
              <th key={p.id} scope="col" className="w-24 px-3 py-3 text-center text-sm font-semibold text-slate-900 sm:w-32">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="px-4 py-3 font-normal text-slate-700">
                <span className="font-medium text-slate-900">{r.label}</span>
                {"hint" in r && r.hint ? <span className="mt-0.5 block text-xs text-slate-500">{r.hint as string}</span> : null}
              </th>
              <td className="px-3 py-3 text-center">
                <Cell value={r.free} />
              </td>
              <td className="px-3 py-3 text-center">
                <Cell value={r.team} />
              </td>
              <td className="px-3 py-3 text-center">
                <Cell value={r.business} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "The easy button": North Labs services. No prices; always optional. */
export const SERVICES = [
  {
    name: "Guided Launch",
    summary: "We set up your workspace with you in a few weeks.",
    points: [
      "Portfolio workshop with your leadership team",
      "Your initiatives scored, sized and prioritized",
      "Systems, data dependencies and governance policy configured",
      "Idea intake rolled out to the company",
    ],
  },
  {
    name: "Managed AI office",
    summary: "North Labs runs the portfolio alongside your team.",
    points: [
      "A North Labs team working inside your workspace",
      "Quarterly portfolio and impact reviews",
      "Governance reviews and vendor guidance",
      "Delivery help on the initiatives that matter most",
    ],
  },
] as const;
