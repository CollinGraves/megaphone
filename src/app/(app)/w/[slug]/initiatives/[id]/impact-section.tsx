import { Pencil, Plus, Trash2 } from "lucide-react";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import type { Initiative, Organization } from "@/db/schema";
import { firstYearCost, firstYearRoi, metricImpact, shiftMonth, type ImpactRollup } from "@/lib/impact";
import { METRIC_PERIODS, METRIC_TYPES, labelFrom } from "@/lib/taxonomy";
import { cn, formatNumber, formatUsd } from "@/lib/utils";
import { InlineForm } from "../../_components/client";
import { formatMetricValue, formatMonth, formatPct } from "../../_lib/format";
import type { MetricWithMeasurements } from "../../_lib/portfolio";
import { addMetric, deleteMeasurement, deleteMetric, recordMeasurement, updateMetric } from "../actions";

export function ImpactSection({
  slug,
  org,
  initiative,
  metrics,
  rollup,
  canEdit,
}: {
  slug: string;
  org: Organization;
  initiative: Initiative;
  metrics: MetricWithMeasurements[];
  rollup: ImpactRollup;
  canEdit: boolean;
}) {
  const asOf = new Date();
  const cost = firstYearCost(initiative);
  const roiEstimated = firstYearRoi(rollup.estimatedAnnualUsd, initiative);
  const roiActual = rollup.hasActuals ? firstYearRoi(rollup.actualRunRateUsd, initiative) : null;
  const lastMonth = shiftMonth(asOf, -1).slice(0, 7);

  return (
    <Card>
      <CardHeader
        title="Business impact"
        description={`Estimated vs. actual, annualized. Hours are valued at each metric's rate or the workspace default (${formatUsd(org.defaultHourlyRate)}/h).`}
      />
      <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
        <Kpi label="Estimated / yr" value={rollup.hasEstimate ? formatUsd(rollup.estimatedAnnualUsd, true) : "—"} />
        <Kpi label="Actual run-rate / yr" value={rollup.hasActuals ? formatUsd(rollup.actualRunRateUsd, true) : "—"} accent />
        <Kpi label="Realized, last 12 mo" value={rollup.hasActuals ? formatUsd(rollup.actualTrailing12Usd, true) : "—"} />
        <Kpi
          label="First-year ROI"
          value={roiActual != null ? formatPct(roiActual) : roiEstimated != null ? formatPct(roiEstimated) : "—"}
          hint={cost == null ? "add costs" : roiActual != null ? "on actuals" : roiEstimated != null ? "projected" : undefined}
        />
      </div>

      {metrics.length === 0 ? (
        <CardBody>
          <p className="text-sm text-slate-500">
            No impact metrics yet.{canEdit ? " Add the value you expect — hours saved, cost avoided, revenue — then record actuals monthly." : ""}
          </p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-slate-100">
          {metrics.map((m) => {
            const mi = metricImpact(m, m.measurements, org.defaultHourlyRate, asOf);
            const typeLabel = labelFrom(METRIC_TYPES, m.type);
            return (
              <li key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{m.name}</h3>
                      <Badge tone={m.type === "revenue_generated" ? "radar" : m.type === "cost_saved" ? "blue" : m.type === "hours_saved" ? "violet" : "neutral"}>{typeLabel}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Estimate {formatMetricValue(m.estimatedValue, m.unit, false)} {labelFrom(METRIC_PERIODS, m.period)}
                      {m.type === "hours_saved" ? ` · valued at ${formatUsd(mi.usdPerUnit)}/h${m.hourlyRate == null ? " (default)" : ""}` : ""}
                      {mi.usdPerUnit == null ? " · not converted to dollars" : ""}
                    </p>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-right text-xs">
                    <dt className="text-slate-500">Est. / yr</dt>
                    <dt className="text-slate-500">Actual run-rate</dt>
                    <dd className="text-sm font-medium tabular-nums text-slate-700">
                      {mi.estimatedAnnualUsd != null ? formatUsd(mi.estimatedAnnualUsd, true) : formatMetricValue(mi.estimatedAnnual, m.unit)}
                    </dd>
                    <dd className="text-sm font-semibold tabular-nums text-slate-900">
                      {mi.actuals ? (mi.actualRunRateUsd != null ? formatUsd(mi.actualRunRateUsd, true) : formatMetricValue(mi.actuals.runRate, m.unit)) : "—"}
                    </dd>
                  </dl>
                </div>

                {m.measurements.length > 0 ? <MetricHistory metric={m} asOf={asOf} /> : null}
                {m.assumptions ? <p className="mt-2 text-xs text-slate-500">Assumptions: {m.assumptions}</p> : null}

                {canEdit || m.measurements.length > 0 ? (
                  <details className="group mt-2">
                    <summary className="cursor-pointer list-none text-xs font-medium text-slate-500 hover:text-slate-800">
                      <span className="group-open:hidden">Show history{canEdit ? " & edit" : ""} ›</span>
                      <span className="hidden group-open:inline">Hide ‹</span>
                    </summary>
                    <div className="mt-3 grid gap-4 lg:grid-cols-2">
                      <div>
                        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded actuals</h4>
                        {m.measurements.length === 0 ? (
                          <p className="text-xs text-slate-500">None yet.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {[...m.measurements].reverse().map((x) => (
                                <tr key={x.id} className="border-b border-slate-100 last:border-0">
                                  <td className="py-1.5 text-slate-600">{formatMonth(x.periodStart)}</td>
                                  <td className="py-1.5 text-right font-medium tabular-nums text-slate-900">{formatMetricValue(x.value, m.unit, false)}</td>
                                  <td className="max-w-40 truncate py-1.5 pl-3 text-slate-500" title={x.note ?? undefined}>
                                    {x.note}
                                  </td>
                                  {canEdit ? (
                                    <td className="w-8 py-1 text-right">
                                      <InlineForm action={deleteMeasurement}>
                                        <input type="hidden" name="slug" value={slug} />
                                        <input type="hidden" name="id" value={x.id} />
                                        <ConfirmSubmit message={`Delete the ${formatMonth(x.periodStart)} measurement?`} className="h-6 px-1.5 text-slate-400 hover:text-red-600">
                                          <Trash2 className="size-3.5" />
                                          <span className="sr-only">Delete</span>
                                        </ConfirmSubmit>
                                      </InlineForm>
                                    </td>
                                  ) : null}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                      {canEdit ? (
                        <div className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <Pencil className="mr-1 inline size-3" /> Edit metric
                          </h4>
                          <MetricFields slug={slug} action={updateMetric} hidden={{ id: m.id }} metric={m} submitLabel="Save metric" />
                          <InlineForm action={deleteMetric}>
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="id" value={m.id} />
                            <ConfirmSubmit message={`Delete “${m.name}” and all its recorded actuals?`} className="text-red-600 hover:bg-red-50">
                              <Trash2 className="size-3.5" /> Delete metric
                            </ConfirmSubmit>
                          </InlineForm>
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit ? (
        <div className="grid gap-px border-t border-slate-100 bg-slate-100 lg:grid-cols-2">
          {metrics.length > 0 ? (
            <div className="bg-white px-5 py-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">Record actuals</h3>
              <ActionForm action={recordMeasurement} className="space-y-3">
                <input type="hidden" name="slug" value={slug} />
                <Field label="Metric" htmlFor="m-metric">
                  <Select id="m-metric" name="metricId" required>
                    {metrics.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.unit}, {labelFrom(METRIC_PERIODS, m.period)})
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Period" htmlFor="m-month" hint="Re-recording a period overwrites it.">
                    <Input id="m-month" name="month" type="month" required max={asOf.toISOString().slice(0, 7)} defaultValue={lastMonth} />
                  </Field>
                  <Field label="Actual value" htmlFor="m-value">
                    <Input id="m-value" name="value" type="number" step="any" required />
                  </Field>
                </div>
                <Field label="Note" htmlFor="m-note">
                  <Input id="m-note" name="note" maxLength={500} placeholder="Source of the number (optional)" />
                </Field>
                <SubmitButton size="sm">Record</SubmitButton>
              </ActionForm>
            </div>
          ) : null}
          <div className={cn("bg-white px-5 py-4", metrics.length === 0 && "lg:col-span-2")}>
            <details open={metrics.length === 0}>
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                <Plus className="mr-1 inline size-4" /> Add impact metric
              </summary>
              <div className="mt-3">
                <MetricFields slug={slug} action={addMetric} hidden={{ initiativeId: initiative.id }} submitLabel="Add metric" resetOnSuccess />
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function Kpi({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="bg-white px-5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", accent ? "text-radar-700" : "text-slate-900")}>
        {value}
        {hint ? <span className="ml-1.5 text-xs font-normal text-slate-500">{hint}</span> : null}
      </div>
    </div>
  );
}

function MetricFields({
  slug,
  action,
  hidden,
  metric,
  submitLabel,
  resetOnSuccess,
}: {
  slug: string;
  action: Parameters<typeof ActionForm>[0]["action"];
  hidden: Record<string, string>;
  metric?: MetricWithMeasurements;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const p = metric?.id ?? "new";
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess={resetOnSuccess}>
      <input type="hidden" name="slug" value={slug} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${p}-type`}>
          <Select id={`${p}-type`} name="type" defaultValue={metric?.type ?? "hours_saved"}>
            {METRIC_TYPES.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor={`${p}-name`}>
          <Input id={`${p}-name`} name="name" required minLength={2} maxLength={120} defaultValue={metric?.name} placeholder="e.g. Agent handling time saved" />
        </Field>
        <Field label="Estimated value" htmlFor={`${p}-est`}>
          <Input id={`${p}-est`} name="estimatedValue" type="number" min={0} step="any" defaultValue={metric?.estimatedValue ?? ""} />
        </Field>
        <Field label="Period" htmlFor={`${p}-period`}>
          <Select id={`${p}-period`} name="period" defaultValue={metric?.period ?? "monthly"}>
            {METRIC_PERIODS.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hourly rate (USD)" htmlFor={`${p}-rate`} hint="Hours saved only. Blank = workspace default.">
          <Input id={`${p}-rate`} name="hourlyRate" type="number" min={0} step="any" defaultValue={metric?.hourlyRate ?? ""} />
        </Field>
        <Field label="Unit" htmlFor={`${p}-unit`} hint="Custom metrics only (hours / usd are implied otherwise).">
          <Input id={`${p}-unit`} name="unit" maxLength={30} defaultValue={metric?.type === "custom" ? metric.unit : ""} placeholder="e.g. tickets, %, usd" />
        </Field>
      </div>
      <Field label="Assumptions" htmlFor={`${p}-assumptions`}>
        <Textarea id={`${p}-assumptions`} name="assumptions" rows={2} maxLength={2000} defaultValue={metric?.assumptions ?? ""} className="min-h-16" placeholder="How the estimate was derived" />
      </Field>
      <SubmitButton size="sm" variant="secondary">
        {submitLabel}
      </SubmitButton>
    </ActionForm>
  );
}

/** Last 12 periods as bars, with the per-period estimate as a dashed reference line. */
function MetricHistory({ metric, asOf }: { metric: MetricWithMeasurements; asOf: Date }) {
  if (metric.period === "one_time") return null;
  const byMonth = new Map(metric.measurements.map((x) => [x.periodStart.slice(0, 7), x.value]));
  const months = Array.from({ length: 12 }, (_, idx) => shiftMonth(asOf, idx - 11).slice(0, 7));
  const estimate = metric.estimatedValue ?? null;
  const max = Math.max(1, estimate ?? 0, ...months.map((k) => byMonth.get(k) ?? 0));
  return (
    <div className="mt-3">
      <div className="relative flex h-16 items-end gap-1 border-b border-slate-200" role="img" aria-label={`${metric.name}: last 12 periods`}>
        {estimate != null && estimate > 0 ? (
          <div className="absolute inset-x-0 border-t border-dashed border-slate-400" style={{ bottom: `${(estimate / max) * 100}%` }} title={`Estimate ${formatNumber(estimate)}`} />
        ) : null}
        {months.map((k) => {
          const v = byMonth.get(k);
          return (
            <div key={k} className="flex h-full flex-1 items-end" title={`${formatMonth(`${k}-01`)}: ${v == null ? "no data" : formatMetricValue(v, metric.unit, false)}`}>
              <div className={cn("w-full rounded-t-sm", v == null ? "h-px bg-slate-200" : "bg-radar-500")} style={v == null ? undefined : { height: `${Math.max(2, (v / max) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{formatMonth(`${months[0]}-01`)}</span>
        <span>{estimate != null ? "- - estimate" : ""}</span>
        <span>{formatMonth(`${months[11]}-01`)}</span>
      </div>
    </div>
  );
}
