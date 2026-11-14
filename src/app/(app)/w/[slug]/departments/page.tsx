import type { Metadata } from "next";
import Link from "next/link";
import { Building, Lock } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ButtonLink, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { listDepartments } from "@/lib/departments.server";
import { FEATURE_LABELS, hasFeature, planForFeature } from "@/lib/plans";
import { formatUsd } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { bestValue, loadPortfolio } from "../_lib/portfolio";
import { createDepartment } from "./actions";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage({ params }: PageProps<"/w/[slug]/departments">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const enabled = hasFeature(ctx.org.plan, "departments");
  const [list, portfolio] = await Promise.all([listDepartments(ctx.org.id), loadPortfolio(ctx.org)]);
  const valueBy = new Map<string, number>();
  for (const i of portfolio.items) if (i.departmentId) valueBy.set(i.departmentId, (valueBy.get(i.departmentId) ?? 0) + bestValue(i.impact));
  const canCreate = enabled && ctx.can("departments:manage");

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Departments"
        description="Give each part of the company its own people, leads, initiatives, ideas and radar. Everyone can see every department's work."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {list.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {list.map((d) => (
                <li key={d.id}>
                  <Link href={`/w/${ctx.org.slug}/departments/${d.slug}`} className="group block h-full">
                    <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 group-hover:text-radar-700">{d.name}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500">
                            {d.leadNames.length ? `Led by ${d.leadNames.join(", ")}` : "No lead yet"} · {d.memberCount} {d.memberCount === 1 ? "person" : "people"}
                          </div>
                        </div>
                        {d.newIdeaCount ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{d.newIdeaCount} new ideas</span> : null}
                      </div>
                      {d.description ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{d.description}</p> : null}
                      <dl className="mt-4 flex gap-6 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500">Initiatives</dt>
                          <dd className="font-semibold tabular-nums text-slate-900">{d.initiativeCount}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Est. annual value</dt>
                          <dd className="font-semibold tabular-nums text-slate-900">{formatUsd(valueBy.get(d.id) ?? 0)}</dd>
                        </div>
                      </dl>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Building className="size-6" />}
              title="No departments yet"
              description={
                enabled
                  ? "Create one for each team that runs its own AI work, like Finance, Sales or Operations. Then assign initiatives and ideas to it."
                  : "Departments let Finance, Sales and other teams run their own slice of the portfolio, with leads who can triage ideas and approve reviews."
              }
            />
          )}
        </div>

        <aside className="space-y-6">
          {canCreate ? (
            <Card>
              <CardHeader title="New department" />
              <CardBody>
                <ActionForm action={createDepartment} resetOnSuccess>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <Field label="Name" htmlFor="dept-name">
                    <Input id="dept-name" name="name" required minLength={2} maxLength={60} placeholder="Finance" />
                  </Field>
                  <Field label="What it covers (optional)" htmlFor="dept-desc">
                    <Textarea id="dept-desc" name="description" rows={2} maxLength={280} />
                  </Field>
                  <SubmitButton className="w-full" pendingText="Creating…">
                    Create department
                  </SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ) : !enabled ? (
            <Card className="p-5">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Lock className="size-4 text-slate-400" /> {FEATURE_LABELS.departments.name}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {FEATURE_LABELS.departments.description} Included on {planForFeature("departments").name} and above.
              </p>
              {ctx.can("billing:manage") ? (
                <ButtonLink href={`/w/${ctx.org.slug}/billing`} size="sm" className="mt-3 w-full">
                  See plans
                </ButtonLink>
              ) : null}
            </Card>
          ) : (
            <Card className="p-5 text-sm text-slate-600">A workspace admin can create departments and choose their leads.</Card>
          )}
          <Card className="p-5 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">What leads can do</div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Add and remove people in their department</li>
              <li>Triage ideas sent to their department</li>
              <li>Approve governance reviews for their department&apos;s initiatives</li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
