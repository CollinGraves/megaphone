import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, isNull, notInArray } from "drizzle-orm";
import { ArrowLeft, ExternalLink, Lock } from "lucide-react";
import { db } from "@/db";
import { consultantAssignments, initiatives, invitations, memberships, organizations, user } from "@/db/schema";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, buttonClass, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { HEALTH, INDUSTRIES, industryLabel, labelFrom, ORG_ROLES, STAGES } from "@/lib/taxonomy";
import { formatDate, formatUsd, timeAgo } from "@/lib/utils";
import { getVisibleOrgOrNotFound, isAdmin } from "../../_lib/access";
import { AutoSubmitSelect } from "../../_components/auto-submit-select";
import { OrgStatusBadge, PLAN_LABELS, PlanBadge } from "../../_components/badges";
import { InlineForm } from "../../_components/inline-form";
import {
  assignConsultant,
  inviteMember,
  removeMember,
  revokeInvitation,
  setWorkspaceStatus,
  unassignConsultant,
  updateMemberRole,
  updateWorkspaceSettings,
} from "../actions";
import { BillingCard } from "./billing-card";
import { InviteForm } from "./invite-form";

export async function generateMetadata({ params }: PageProps<"/admin/workspaces/[orgId]">): Promise<Metadata> {
  const { orgId } = await params;
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return { title: org?.name ?? "Workspace" };
}

export default async function WorkspaceDetailPage({ params }: PageProps<"/admin/workspaces/[orgId]">) {
  const me = await requireStaff();
  const { orgId } = await params;
  const org = await getVisibleOrgOrNotFound(me, orgId);
  const admin = isAdmin(me);
  const provisioner = loadProvisioner(org.provisionedById);

  const [members, pendingInvites, assigned, stageCounts, healthCounts, [provisionedBy]] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, email: user.email, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(user, eq(user.id, memberships.userId))
      .where(eq(memberships.orgId, org.id))
      .orderBy(user.name),
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
        invitedBy: user.name,
      })
      .from(invitations)
      .leftJoin(user, eq(user.id, invitations.invitedById))
      .where(and(eq(invitations.orgId, org.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
      .orderBy(desc(invitations.createdAt)),
    db
      .select({ userId: user.id, name: user.name, email: user.email, since: consultantAssignments.createdAt })
      .from(consultantAssignments)
      .innerJoin(user, eq(user.id, consultantAssignments.userId))
      .where(eq(consultantAssignments.orgId, org.id))
      .orderBy(user.name),
    db
      .select({ stage: initiatives.stage, n: count() })
      .from(initiatives)
      .where(and(eq(initiatives.orgId, org.id), isNull(initiatives.archivedAt)))
      .groupBy(initiatives.stage),
    db
      .select({ health: initiatives.health, n: count() })
      .from(initiatives)
      .where(and(eq(initiatives.orgId, org.id), isNull(initiatives.archivedAt)))
      .groupBy(initiatives.health),
    provisioner,
  ]);

  const availableConsultants = admin
    ? await db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(
          and(
            eq(user.platformRole, "consultant"),
            assigned.length ? notInArray(user.id, assigned.map((a) => a.userId)) : undefined,
          ),
        )
        .orderBy(user.name)
    : [];

  const byStage = new Map(stageCounts.map((s) => [s.stage, s.n]));
  const byHealth = new Map(healthCounts.map((h) => [h.health, h.n]));
  const totalInitiatives = stageCounts.reduce((sum, s) => sum + s.n, 0);
  const maxStage = Math.max(1, ...stageCounts.map((s) => s.n));
  const now = new Date();

  return (
    <>
      <Link href="/admin/workspaces" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> Workspaces
      </Link>
      <PageHeader
        eyebrow={org.industry ? industryLabel(org.industry) : "Client workspace"}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {org.name}
            <PlanBadge plan={org.plan} />
            <OrgStatusBadge status={org.status} />
          </span>
        }
        description={
          <>
            <span className="font-mono">/w/{org.slug}</span> · Provisioned {formatDate(org.createdAt)}
            {provisionedBy ? ` by ${provisionedBy.name}` : ""}
          </>
        }
        actions={
          <Link href={`/w/${org.slug}`} className={buttonClass("accent")}>
            Open workspace <ExternalLink className="size-4" aria-hidden />
          </Link>
        }
      />

      {!admin ? (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Lock className="size-4 shrink-0" aria-hidden />
          Read-only. Plan, status, consultants and access are managed by North Labs admins. Manage day-to-day work inside the workspace.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Initiatives by stage" description={`${totalInitiatives} active initiatives`} />
            <CardBody className="space-y-2">
              {STAGES.map((s) => {
                const n = byStage.get(s.slug) ?? 0;
                return (
                  <div key={s.slug} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-3 text-sm">
                    <span className="text-slate-600">{s.label}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-radar-500" style={{ width: `${(n / maxStage) * 100}%` }} />
                    </div>
                    <span className="text-right font-medium tabular-nums text-slate-900">{n}</span>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2 pt-2">
                {HEALTH.map((h) => (
                  <Badge key={h.slug} tone={h.slug === "on_track" ? "radar" : h.slug === "at_risk" ? "amber" : "red"}>
                    {byHealth.get(h.slug) ?? 0} {h.label.toLowerCase()}
                  </Badge>
                ))}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Members" description={`${members.length} ${members.length === 1 ? "person" : "people"} in this workspace`} />
            {members.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No members yet. The owner joins when they accept their invitation.</p>
              </CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Member</Th>
                    <Th>Role</Th>
                    <Th className="hidden sm:table-cell">Joined</Th>
                    {admin ? (
                      <Th className="relative">
                        <span className="sr-only">Actions</span>
                      </Th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.userId}>
                      <Td>
                        <div className="font-medium text-slate-900">{m.name}</div>
                        <div className="text-xs text-slate-500">{m.email}</div>
                      </Td>
                      <Td>
                        {admin ? (
                          <InlineForm action={updateMemberRole}>
                            <input type="hidden" name="orgId" value={org.id} />
                            <input type="hidden" name="userId" value={m.userId} />
                            <AutoSubmitSelect key={m.role} name="role" defaultValue={m.role} aria-label={`Role for ${m.name}`} className="h-8 w-32">
                              {ORG_ROLES.map((r) => (
                                <option key={r.slug} value={r.slug}>
                                  {r.label}
                                </option>
                              ))}
                            </AutoSubmitSelect>
                          </InlineForm>
                        ) : (
                          labelFrom(ORG_ROLES, m.role)
                        )}
                      </Td>
                      <Td className="hidden whitespace-nowrap text-slate-500 sm:table-cell">{formatDate(m.joinedAt)}</Td>
                      {admin ? (
                        <Td className="text-right">
                          <InlineForm action={removeMember} className="justify-end">
                            <input type="hidden" name="orgId" value={org.id} />
                            <input type="hidden" name="userId" value={m.userId} />
                            <ConfirmSubmit message={`Remove ${m.name} from ${org.name}?`} className="text-red-700">
                              Remove
                            </ConfirmSubmit>
                          </InlineForm>
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Pending invitations" />
            {pendingInvites.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No pending invitations.</p>
              </CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Email</Th>
                    <Th>Role</Th>
                    <Th className="hidden sm:table-cell">Invited</Th>
                    {admin ? (
                      <Th className="relative">
                        <span className="sr-only">Actions</span>
                      </Th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.map((inv) => {
                    const expired = inv.expiresAt < now;
                    return (
                      <tr key={inv.id}>
                        <Td>
                          <div className="text-slate-900">{inv.email}</div>
                          {expired ? (
                            <Badge tone="red" className="mt-1">
                              Expired
                            </Badge>
                          ) : (
                            <div className="text-xs text-slate-500">Expires {timeAgo(inv.expiresAt)}</div>
                          )}
                        </Td>
                        <Td>{labelFrom(ORG_ROLES, inv.role)}</Td>
                        <Td className="hidden text-slate-500 sm:table-cell">
                          {timeAgo(inv.createdAt)}
                          {inv.invitedBy ? ` by ${inv.invitedBy}` : ""}
                        </Td>
                        {admin ? (
                          <Td className="text-right">
                            <form action={revokeInvitation}>
                              <input type="hidden" name="orgId" value={org.id} />
                              <input type="hidden" name="invitationId" value={inv.id} />
                              <ConfirmSubmit message={`Revoke the invitation for ${inv.email}?`} className="text-red-700">
                                Revoke
                              </ConfirmSubmit>
                            </form>
                          </Td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
            {admin ? (
              <CardBody className="border-t border-slate-100">
                <h3 className="mb-2 text-sm font-medium text-slate-900">Invite someone</h3>
                <InviteForm action={inviteMember.bind(null, org.id)} />
                <p className="mt-2 text-xs text-slate-500">
                  Re-inviting an email replaces its previous link. People who already have an account are added immediately.
                </p>
              </CardBody>
            ) : null}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Plan & settings" />
            <CardBody>
              {admin ? (
                // Selects are keyed on saved values: React's post-action form reset would otherwise
                // restore the options selected at first mount.
                <ActionForm action={updateWorkspaceSettings.bind(null, org.id)}>
                  <Field label="Name" htmlFor="name">
                    <Input id="name" name="name" defaultValue={org.name} required minLength={2} maxLength={120} />
                  </Field>
                  <Field label="Industry" htmlFor="industry">
                    <Select key={org.industry ?? ""} id="industry" name="industry" defaultValue={org.industry ?? ""}>
                      <option value="">Not specified</option>
                      {INDUSTRIES.map((i) => (
                        <option key={i.slug} value={i.slug}>
                          {i.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Plan" htmlFor="plan">
                    <Select key={org.plan} id="plan" name="plan" defaultValue={org.plan}>
                      {(Object.keys(PLAN_LABELS) as (keyof typeof PLAN_LABELS)[]).map((p) => (
                        <option key={p} value={p}>
                          {PLAN_LABELS[p]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Default hourly rate (USD)" htmlFor="defaultHourlyRate">
                    <Input
                      id="defaultHourlyRate"
                      name="defaultHourlyRate"
                      type="number"
                      min={0}
                      max={10000}
                      step="any"
                      defaultValue={org.defaultHourlyRate}
                      required
                    />
                  </Field>
                  <SubmitButton>Save settings</SubmitButton>
                </ActionForm>
              ) : (
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-slate-500">Plan</dt>
                  <dd className="text-slate-900">{PLAN_LABELS[org.plan]}</dd>
                  <dt className="text-slate-500">Industry</dt>
                  <dd className="text-slate-900">{org.industry ? industryLabel(org.industry) : "—"}</dd>
                  <dt className="text-slate-500">Hourly rate</dt>
                  <dd className="text-slate-900">{formatUsd(org.defaultHourlyRate)}</dd>
                </dl>
              )}
            </CardBody>
          </Card>

          <BillingCard org={org} />

          <Card>
            <CardHeader
              title="Status"
              description={org.status === "active" ? "Clients can use this workspace." : "Suspended: client members are locked out; staff keep access."}
            />
            {admin ? (
              <CardBody>
                <form action={setWorkspaceStatus}>
                  <input type="hidden" name="orgId" value={org.id} />
                  {org.status === "active" ? (
                    <>
                      <input type="hidden" name="status" value="suspended" />
                      <ConfirmSubmit variant="danger" size="md" message={`Suspend ${org.name}? Client members will lose access until reactivated.`}>
                        Suspend workspace
                      </ConfirmSubmit>
                    </>
                  ) : (
                    <>
                      <input type="hidden" name="status" value="active" />
                      <SubmitButton variant="accent" pendingText="Reactivating…">
                        Reactivate workspace
                      </SubmitButton>
                    </>
                  )}
                </form>
              </CardBody>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Consultants" description="North Labs consultants with access to this workspace" />
            {assigned.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No consultants assigned.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {assigned.map((c) => (
                  <li key={c.userId} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {c.name}
                        {c.userId === me.id ? <span className="font-normal text-slate-500"> (you)</span> : null}
                      </div>
                      <div className="truncate text-xs text-slate-500">{c.email}</div>
                    </div>
                    {admin ? (
                      <form action={unassignConsultant}>
                        <input type="hidden" name="orgId" value={org.id} />
                        <input type="hidden" name="userId" value={c.userId} />
                        <ConfirmSubmit message={`Remove ${c.name} from ${org.name}?`} className="text-red-700">
                          Remove
                        </ConfirmSubmit>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {admin ? (
              <CardBody className="border-t border-slate-100">
                {availableConsultants.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    {assigned.length ? "All consultants are assigned." : "No consultants yet."}{" "}
                    <Link href="/admin/users" className="font-medium text-radar-700 hover:underline">
                      Manage roles
                    </Link>
                  </p>
                ) : (
                  <ActionForm action={assignConsultant.bind(null, org.id)} className="space-y-2">
                    <div className="flex gap-2">
                      <Select name="userId" required defaultValue="" aria-label="Consultant" className="min-w-0 flex-1">
                        <option value="" disabled>
                          Choose a consultant…
                        </option>
                        {availableConsultants.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.email})
                          </option>
                        ))}
                      </Select>
                      <SubmitButton variant="secondary" pendingText="…">
                        Assign
                      </SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </CardBody>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}

function loadProvisioner(provisionedById: string | null) {
  return provisionedById
    ? db.select({ name: user.name }).from(user).where(eq(user.id, provisionedById)).limit(1)
    : Promise.resolve([] as { name: string }[]);
}
