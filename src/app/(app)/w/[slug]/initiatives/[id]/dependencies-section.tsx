import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Card, CardHeader, Field, Input, Select } from "@/components/ui";
import type { System } from "@/db/schema";
import { ACCESS_STATUSES, SENSITIVITIES, SYSTEM_CATEGORIES, labelFrom } from "@/lib/taxonomy";
import { AccessBadge, SensitivityBadge } from "../../_components/badges";
import { AutoSubmitSelect, InlineForm } from "../../_components/client";
import { addDependency, removeDependency, updateDependencyStatus } from "../actions";

export type DependencyRow = {
  id: string;
  dataDescription: string;
  accessStatus: string;
  sensitivity: string;
  notes: string | null;
  systemId: string;
  systemName: string;
  systemCategory: string;
};

export function DependenciesSection({
  slug,
  initiativeId,
  deps,
  systems,
  canEdit,
  canCreateSystem,
}: {
  slug: string;
  initiativeId: string;
  deps: DependencyRow[];
  systems: System[];
  canEdit: boolean;
  canCreateSystem: boolean;
}) {
  return (
    <Card>
      <CardHeader title="Data dependencies" description="Systems of record this initiative reads from or writes to, and where access stands." />
      {deps.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">No data dependencies recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {deps.map((d) => (
            <li key={d.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/w/${slug}/systems/${d.systemId}`} className="text-sm font-semibold text-slate-900 hover:text-radar-700 hover:underline">
                    {d.systemName}
                  </Link>
                  <span className="text-xs text-slate-400">{labelFrom(SYSTEM_CATEGORIES, d.systemCategory)}</span>
                  <SensitivityBadge sensitivity={d.sensitivity} />
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{d.dataDescription}</p>
                {d.notes ? <p className="mt-0.5 text-xs text-slate-500">{d.notes}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canEdit ? (
                  <>
                    <InlineForm action={updateDependencyStatus}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={d.id} />
                      <label className="sr-only" htmlFor={`access-${d.id}`}>
                        Access status for {d.systemName}
                      </label>
                      <AutoSubmitSelect id={`access-${d.id}`} name="accessStatus" defaultValue={d.accessStatus}>
                        {ACCESS_STATUSES.map((a) => (
                          <option key={a.slug} value={a.slug}>
                            {a.label}
                          </option>
                        ))}
                      </AutoSubmitSelect>
                      <noscript>
                        <SubmitButton size="sm" variant="secondary">
                          Save
                        </SubmitButton>
                      </noscript>
                    </InlineForm>
                    <InlineForm action={removeDependency}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="id" value={d.id} />
                      <ConfirmSubmit message={`Remove the dependency on ${d.systemName}?`} className="h-8 px-2 text-slate-400 hover:text-red-600">
                        <Trash2 className="size-3.5" />
                        <span className="sr-only">Remove</span>
                      </ConfirmSubmit>
                    </InlineForm>
                  </>
                ) : (
                  <AccessBadge status={d.accessStatus} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <details open={deps.length === 0}>
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              <Plus className="mr-1 inline size-4" /> Add data dependency
            </summary>
            <ActionForm action={addDependency} className="mt-3 space-y-3" resetOnSuccess>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="initiativeId" value={initiativeId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="System" htmlFor="dep-system">
                  <Select id="dep-system" name="systemId" defaultValue={systems[0]?.id ?? "__new"}>
                    {systems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    {canCreateSystem ? <option value="__new">+ New system…</option> : null}
                  </Select>
                </Field>
                <Field label="Data needed" htmlFor="dep-data">
                  <Input id="dep-data" name="dataDescription" required minLength={2} maxLength={500} placeholder="e.g. Open sales orders, last 3 years" />
                </Field>
              </div>
              {canCreateSystem ? (
                <div className="grid gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
                  <p className="text-xs text-slate-500 sm:col-span-2">New system — only used when “+ New system…” is selected.</p>
                  <Field label="New system name" htmlFor="dep-new-name">
                    <Input id="dep-new-name" name="newSystemName" maxLength={120} placeholder="e.g. Oracle NetSuite" />
                  </Field>
                  <Field label="Category" htmlFor="dep-new-cat">
                    <Select id="dep-new-cat" name="newSystemCategory" defaultValue="other">
                      {SYSTEM_CATEGORIES.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Access status" htmlFor="dep-access">
                  <Select id="dep-access" name="accessStatus" defaultValue="not_requested">
                    {ACCESS_STATUSES.map((a) => (
                      <option key={a.slug} value={a.slug}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sensitivity" htmlFor="dep-sens">
                  <Select id="dep-sens" name="sensitivity" defaultValue="internal">
                    {SENSITIVITIES.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Notes" htmlFor="dep-notes">
                <Input id="dep-notes" name="notes" maxLength={1000} placeholder="Approvals needed, owners, blockers (optional)" />
              </Field>
              <SubmitButton size="sm" variant="secondary">
                Add dependency
              </SubmitButton>
            </ActionForm>
          </details>
        </div>
      ) : null}
    </Card>
  );
}
