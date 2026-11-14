import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { StoryCard } from "@/components/stories/story-card";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Field, Input, Select, Stat, Table, Td, Textarea, Th } from "@/components/ui";
import { db } from "@/db";
import { ideas } from "@/db/schema";
import { DEPARTMENT_ROLES } from "@/lib/departments";
import { canForDepartment, getDepartment, listDepartmentMembers, workspaceMembersOutside } from "@/lib/departments.server";
import { hasFeature } from "@/lib/plans";
import { listStories } from "@/lib/stories";
import { formatUsd, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { AlertList } from "../../_components/alert-list";
import { ScorePill, StageBadge } from "../../_components/badges";
import { loadOpenAlerts } from "../../_lib/alerts";
import { bestValue, loadPortfolio } from "../../_lib/portfolio";
import { addDepartmentMember, deleteDepartment, removeDepartmentMember, setDepartmentRole, updateDepartment } from "../actions";

export async function generateMetadata({ params }: PageProps<"/w/[slug]/departments/[dept]">): Promise<Metadata> {
  const { slug, dept } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const d = await getDepartment(ctx.org.id, { slug: dept });
  return { title: d ? d.name : "Department" };
}

export default async function DepartmentPage({ params }: PageProps<"/w/[slug]/departments/[dept]">) {
  const { slug, dept: deptSlug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const dept = await getDepartment(ctx.org.id, { slug: deptSlug });
  if (!dept) notFound();
  const base = `/w/${ctx.org.slug}`;

  const [portfolio, members, outside, canManage, canTriage, canApprove, allAlerts, deptIdeas] = await Promise.all([
    loadPortfolio(ctx.org),
    listDepartmentMembers(dept.id),
    workspaceMembersOutside(ctx.org.id, dept.id),
    canForDepartment(ctx, "departments:manage", dept.id),
    canForDepartment(ctx, "ideas:triage", dept.id),
    canForDepartment(ctx, "governance:approve", dept.id),
    loadOpenAlerts(ctx.org.id, { limit: 200 }),
    db
      .select({ id: ideas.id, title: ideas.title, status: ideas.status, submitterName: ideas.submitterName, createdAt: ideas.createdAt })
      .from(ideas)
      .where(and(eq(ideas.orgId, ctx.org.id), eq(ideas.departmentId, dept.id), inArray(ideas.status, ["new", "under_review"])))
      .orderBy(desc(ideas.createdAt))
      .limit(10),
  ]);
  const items = portfolio.items.filter((i) => i.departmentId === dept.id && !i.archivedAt);
  const ids = new Set(items.map((i) => i.id));
  const alerts = allAlerts.filter((a) => ids.has(a.initiativeId)).slice(0, 8);
  const platforms = [...new Set(items.flatMap((i) => i.platforms))];
  const stories = platforms.length ? await listStories({ vendors: platforms, matchAny: true, sinceDays: 14, order: "top", limit: 4 }) : [];
  const value = items.reduce((n, i) => n + bestValue(i.impact), 0);
  const pendingReviews = items.filter((i) => i.approvalStatus === "pending");
  const enabled = hasFeature(ctx.org.plan, "departments");
  const editable = enabled && canManage;

  return (
    <div className="space-y-6">
      <Link href={`${base}/departments`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="size-4" /> Departments
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{dept.name}</h1>
        {dept.description ? <p className="mt-1 max-w-2xl text-sm text-slate-600">{dept.description}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Initiatives" value={String(items.length)} />
        <Stat label="In production" value={String(items.filter((i) => i.stage === "production").length)} />
        <Stat label="Est. annual value" value={formatUsd(value)} />
        <Stat label="Open ideas" value={String(deptIdeas.length)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {pendingReviews.length && canApprove ? (
            <Card className="border-amber-300 p-4">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-amber-600" />
                <span className="font-medium text-slate-900">
                  {pendingReviews.length} governance {pendingReviews.length === 1 ? "review is" : "reviews are"} waiting
                </span>
                <Link href={`${base}/governance`} className="ml-auto text-radar-700 hover:underline">
                  Review
                </Link>
              </div>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader title="Initiatives" description="Assign an initiative to this department from its edit form." />
            {items.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Initiative</Th>
                      <Th>Stage</Th>
                      <Th>Score</Th>
                      <Th className="text-right">Value / yr</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-t border-slate-100">
                        <Td className="min-w-48">
                          <Link href={`${base}/initiatives/${i.id}`} className="font-medium text-slate-900 hover:text-radar-700">
                            {i.title}
                          </Link>
                        </Td>
                        <Td>
                          <StageBadge stage={i.stage} />
                        </Td>
                        <Td>
                          <ScorePill score={i.score} />
                        </Td>
                        <Td className="text-right tabular-nums">{formatUsd(bestValue(i.impact))}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            ) : (
              <CardBody>
                <p className="text-sm text-slate-500">No initiatives yet.</p>
              </CardBody>
            )}
          </Card>

          <Card>
            <CardHeader title="Radar" description={platforms.length ? "News that affects the platforms this department builds on." : "Shows news once this department's initiatives list their platforms."} />
            {alerts.length ? <AlertList alerts={alerts} slug={ctx.org.slug} canDismiss={ctx.can("initiative:write")} showSummary={false} /> : null}
            {stories.length ? (
              <CardBody className="space-y-3">
                {stories.map((s) => (
                  <StoryCard key={s.id} story={s} compact />
                ))}
              </CardBody>
            ) : !alerts.length ? (
              <CardBody>
                <p className="text-sm text-slate-500">Nothing new for this department.</p>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Ideas" description={canTriage ? "Ideas sent to this department. You can triage them." : "Ideas sent to this department."} />
            {deptIdeas.length ? (
              <ul className="divide-y divide-slate-100">
                {deptIdeas.map((idea) => (
                  <li key={idea.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <Link href={`${base}/ideas/${idea.id}`} className="min-w-0 truncate font-medium text-slate-900 hover:text-radar-700">
                      {idea.title}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-500">
                      {idea.submitterName} · {timeAgo(idea.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <CardBody>
                <p className="text-sm text-slate-500">No open ideas.</p>
              </CardBody>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader title={`People (${members.length})`} />
            <ul className="divide-y divide-slate-100">
              {members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{m.name}</div>
                    <div className="truncate text-xs text-slate-500">{m.jobTitle ?? m.email}</div>
                  </div>
                  {editable ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <ActionForm action={setDepartmentRole} className="space-y-0">
                        <input type="hidden" name="slug" value={ctx.org.slug} />
                        <input type="hidden" name="departmentId" value={dept.id} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <input type="hidden" name="role" value={m.role === "lead" ? "member" : "lead"} />
                        <SubmitButton size="sm" variant="ghost" pendingText="…">
                          {m.role === "lead" ? <Badge tone="radar">Lead</Badge> : "Make lead"}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={removeDepartmentMember} className="space-y-0">
                        <input type="hidden" name="slug" value={ctx.org.slug} />
                        <input type="hidden" name="departmentId" value={dept.id} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <SubmitButton size="sm" variant="ghost" pendingText="…">
                          Remove
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  ) : m.role === "lead" ? (
                    <Badge tone="radar">Lead</Badge>
                  ) : null}
                </li>
              ))}
              {!members.length ? <li className="px-5 py-3 text-sm text-slate-500">Nobody yet.</li> : null}
            </ul>
            {editable && outside.length ? (
              <CardBody className="border-t border-slate-100">
                <ActionForm action={addDepartmentMember} className="space-y-2" resetOnSuccess>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="departmentId" value={dept.id} />
                  <Select name="userId" aria-label="Person" required defaultValue="">
                    <option value="" disabled>
                      Add someone from the workspace
                    </option>
                    {outside.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.name} ({p.email})
                      </option>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    <Select name="role" defaultValue="member" aria-label="Role" className="flex-1">
                      {DEPARTMENT_ROLES.map((r) => (
                        <option key={r.slug} value={r.slug}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton size="sm" variant="secondary">
                      Add
                    </SubmitButton>
                  </div>
                </ActionForm>
              </CardBody>
            ) : null}
          </Card>

          {editable ? (
            <Card>
              <CardHeader title="Department settings" />
              <CardBody className="space-y-4">
                <ActionForm action={updateDepartment}>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="departmentId" value={dept.id} />
                  <Field label="Name" htmlFor="d-name">
                    <Input id="d-name" name="name" required minLength={2} maxLength={60} defaultValue={dept.name} />
                  </Field>
                  <Field label="What it covers" htmlFor="d-desc">
                    <Textarea id="d-desc" name="description" rows={2} maxLength={280} defaultValue={dept.description ?? ""} />
                  </Field>
                  <SubmitButton size="sm">Save</SubmitButton>
                </ActionForm>
                {ctx.can("departments:manage") ? (
                  <ActionForm action={deleteDepartment} className="border-t border-slate-100 pt-4">
                    <input type="hidden" name="slug" value={ctx.org.slug} />
                    <input type="hidden" name="departmentId" value={dept.id} />
                    <ConfirmSubmit message={`Delete ${dept.name}? Its initiatives and ideas stay and become company-wide.`} variant="ghost" size="sm" className="text-red-700">
                      Delete department
                    </ConfirmSubmit>
                  </ActionForm>
                ) : null}
              </CardBody>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
