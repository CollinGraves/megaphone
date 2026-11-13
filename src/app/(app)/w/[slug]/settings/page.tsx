import { GovernanceSettings } from "./governance-settings";
import { IntakeSettings } from "./intake-settings";
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { db } from "@/db";
import { consultantAssignments, invitations, memberships, user, type OrgRole } from "@/db/schema";
import { inviteUrl } from "@/lib/invitations";
import { canAssignRole } from "@/lib/permissions";
import { normalizeWeights } from "@/lib/scoring";
import { INDUSTRIES, ORG_ROLES, industryLabel, labelFrom } from "@/lib/taxonomy";
import { formatDate, formatUsd, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { CopyButton, InlineForm } from "../_components/client";
import { changeRole, inviteMember, removeMember, revokeInvitation, updateInsightsSharing, updateProfile, updateWeights } from "./actions";
import { BRAND, BRAND_COMPANY } from "@/lib/brand";

export const metadata: Metadata = { title: "Settings" };

const WEIGHT_FIELDS = [
  { key: "value", label: "Business value" },
  { key: "feasibility", label: "Feasibility" },
  { key: "alignment", label: "Strategic alignment" },
  { key: "risk", label: "Risk (inverted)" },
] as const;

export default async function SettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const org = ctx.org;
  const canSettings = ctx.can("settings:manage");
  const canMembers = ctx.can("members:manage");
  const actorRole = ctx.access.role;

  const [members, consultants, pending] = await Promise.all([
    db
      .select({ userId: user.id, name: user.name, email: user.email, jobTitle: user.jobTitle, role: memberships.role, joinedAt: memberships.createdAt })
      .from(memberships)
      .innerJoin(user, eq(memberships.userId, user.id))
      .where(eq(memberships.orgId, org.id))
      .orderBy(asc(user.name)),
    db
      .select({ userId: user.id, name: user.name, email: user.email, jobTitle: user.jobTitle })
      .from(consultantAssignments)
      .innerJoin(user, eq(consultantAssignments.userId, user.id))
      .where(and(eq(consultantAssignments.orgId, org.id), eq(user.platformRole, "consultant")))
      .orderBy(asc(user.name)),
    canMembers
      ? db
          .select({ id: invitations.id, email: invitations.email, role: invitations.role, token: invitations.token, createdAt: invitations.createdAt, expiresAt: invitations.expiresAt, invitedBy: user.name })
          .from(invitations)
          .leftJoin(user, eq(invitations.invitedById, user.id))
          .where(and(eq(invitations.orgId, org.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
          .orderBy(desc(invitations.createdAt))
      : Promise.resolve([]),
  ]);

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isMemberOwner = members.some((m) => m.userId === ctx.user.id && m.role === "owner");
  const assignableRoles = ORG_ROLES.filter((r) => canAssignRole(actorRole, r.slug));
  const weights = normalizeWeights(org.scoringWeights);

  return (
    <>
      <PageHeader eyebrow="Workspace" title="Settings" description="Workspace profile, how initiatives are prioritized, and who has access." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Workspace profile" description="The default hourly rate converts hours saved into dollars when a metric doesn't set its own." />
          <CardBody>
            {canSettings ? (
              <ActionForm action={updateProfile} className="space-y-4">
                <input type="hidden" name="slug" value={org.slug} />
                <Field label="Workspace name" htmlFor="org-name">
                  <Input id="org-name" name="name" required minLength={2} maxLength={120} defaultValue={org.name} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Industry" htmlFor="org-industry">
                    <Select id="org-industry" name="industry" defaultValue={org.industry ?? ""}>
                      <option value="">Not set</option>
                      {INDUSTRIES.map((i) => (
                        <option key={i.slug} value={i.slug}>
                          {i.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Default loaded hourly rate (USD)" htmlFor="org-rate">
                    <Input id="org-rate" name="defaultHourlyRate" type="number" min={1} max={10000} step="any" required defaultValue={org.defaultHourlyRate} />
                  </Field>
                </div>
                <SubmitButton size="sm">Save profile</SubmitButton>
              </ActionForm>
            ) : (
              <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
                <dt className="text-slate-500">Name</dt>
                <dd className="text-slate-900">{org.name}</dd>
                <dt className="text-slate-500">Industry</dt>
                <dd className="text-slate-900">{org.industry ? industryLabel(org.industry) : "—"}</dd>
                <dt className="text-slate-500">Default hourly rate</dt>
                <dd className="text-slate-900">{formatUsd(org.defaultHourlyRate)}/h</dd>
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Prioritization weights" description="How much each dimension counts toward the 0–100 priority score. Weights are normalized to 100%." />
          <CardBody>
            {canSettings ? (
              <ActionForm action={updateWeights} className="space-y-4">
                <input type="hidden" name="slug" value={org.slug} />
                <div className="grid grid-cols-2 gap-4">
                  {WEIGHT_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label} htmlFor={`w-${f.key}`}>
                      <div className="relative">
                        <Input id={`w-${f.key}`} name={f.key} type="number" min={0} max={100} step="any" required defaultValue={Math.round(weights[f.key] * 1000) / 10} className="pr-8" />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">%</span>
                      </div>
                    </Field>
                  ))}
                </div>
                <p className="text-xs text-slate-500">Changing weights re-ranks every initiative immediately. Manual rank overrides still apply.</p>
                <SubmitButton size="sm">Save weights</SubmitButton>
              </ActionForm>
            ) : (
              <ul className="space-y-2 text-sm">
                {WEIGHT_FIELDS.map((f) => (
                  <li key={f.key} className="flex justify-between">
                    <span className="text-slate-600">{f.label}</span>
                    <span className="font-medium tabular-nums text-slate-900">{Math.round(weights[f.key] * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Anonymous benchmarks"
          description={`Help other mid-market teams by letting ${BRAND_COMPANY} include this workspace in aggregate stats (on the show and in reports).`}
        />
        <CardBody className="space-y-3 text-sm text-slate-600">
          <p>
            Only rounded totals across at least 5 companies are ever shown, such as &ldquo;35% of initiatives are in pilot&rdquo; or
            &ldquo;Microsoft is used by 60% of companies.&rdquo; Your company name, initiative titles, notes and individual figures are never
            shared. You can turn this off at any time.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={org.shareAggregateInsights ? "radar" : "neutral"}>{org.shareAggregateInsights ? "Sharing on" : "Sharing off"}</Badge>
            {isMemberOwner ? (
              <ActionForm action={updateInsightsSharing} className="space-y-2">
                <input type="hidden" name="slug" value={org.slug} />
                <input type="hidden" name="share" value={org.shareAggregateInsights ? "0" : "1"} />
                <SubmitButton size="sm" variant={org.shareAggregateInsights ? "secondary" : "primary"}>
                  {org.shareAggregateInsights ? "Stop sharing" : "Include this workspace"}
                </SubmitButton>
              </ActionForm>
            ) : (
              <span className="text-xs text-slate-500">Only a workspace owner can change this.</span>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader title="Members" description={`${members.length} member${members.length === 1 ? "" : "s"} from ${org.name}`} />
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Joined</Th>
              {canMembers ? <Th className="text-right">Actions</Th> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const manageable = canMembers && canAssignRole(actorRole, m.role);
              const lastOwner = m.role === "owner" && ownerCount <= 1;
              return (
                <tr key={m.userId}>
                  <Td>
                    <div className="font-medium text-slate-900">
                      {m.name}
                      {m.userId === ctx.user.id ? <span className="ml-1.5 text-xs font-normal text-slate-500">(you)</span> : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {m.email}
                      {m.jobTitle ? ` · ${m.jobTitle}` : ""}
                    </div>
                  </Td>
                  <Td>
                    {manageable && !lastOwner ? (
                      <InlineForm action={changeRole}>
                        <input type="hidden" name="slug" value={org.slug} />
                        <input type="hidden" name="userId" value={m.userId} />
                        <Select name="role" defaultValue={m.role} aria-label={`Role for ${m.name}`} className="h-8 w-28 text-xs">
                          {assignableRoles.map((r) => (
                            <option key={r.slug} value={r.slug}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                        <SubmitButton size="sm" variant="secondary" pendingText="…">
                          Save
                        </SubmitButton>
                      </InlineForm>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <RoleBadge role={m.role} />
                        {lastOwner && canMembers ? <span className="text-xs text-slate-400">last owner</span> : null}
                      </span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-slate-500">{formatDate(m.joinedAt)}</Td>
                  {canMembers ? (
                    <Td className="text-right">
                      {manageable && !lastOwner ? (
                        <InlineForm action={removeMember} className="justify-end">
                          <input type="hidden" name="slug" value={org.slug} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <ConfirmSubmit message={`Remove ${m.name} from ${org.name}?`} className="text-red-600 hover:bg-red-50">
                            Remove
                          </ConfirmSubmit>
                        </InlineForm>
                      ) : null}
                    </Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
        {consultants.length > 0 ? (
          <div className="border-t border-slate-100 px-5 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">North Labs team</h3>
            <p className="mt-0.5 text-xs text-slate-500">Consultants assigned to this workspace have admin access. Assignments are managed by North Labs.</p>
            <ul className="mt-3 flex flex-wrap gap-3">
              {consultants.map((c) => (
                <li key={c.userId} className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 text-sm">
                  <div className="font-medium text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.jobTitle ?? c.email}</div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {canMembers ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-5">
          <Card className="xl:col-span-2">
            <CardHeader title="Invite someone" description={`People without an account get an email link; existing ${BRAND} users are added right away.`} />
            <CardBody>
              <ActionForm action={inviteMember} className="space-y-4" resetOnSuccess>
                <input type="hidden" name="slug" value={org.slug} />
                <Field label="Email" htmlFor="invite-email">
                  <Input id="invite-email" name="email" type="email" required maxLength={254} placeholder="name@company.com" />
                </Field>
                <Field label="Role" htmlFor="invite-role" hint={assignableRoles.map((r) => `${r.label}: ${r.description}`).join(" · ")}>
                  <Select id="invite-role" name="role" defaultValue="viewer">
                    {assignableRoles.map((r) => (
                      <option key={r.slug} value={r.slug}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton size="sm">Send invitation</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card className="overflow-hidden xl:col-span-3">
            <CardHeader title="Pending invitations" description="Links expire after 14 days. Sending a new invite to the same email replaces the old link." />
            {pending.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No pending invitations.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pending.map((inv) => (
                  <li key={inv.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="truncate font-medium text-slate-900">{inv.email}</span>
                        <RoleBadge role={inv.role} />
                      </div>
                      <div className="text-xs text-slate-500">
                        Invited {timeAgo(inv.createdAt)}
                        {inv.invitedBy ? ` by ${inv.invitedBy}` : ""} · expires {formatDate(inv.expiresAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <CopyButton value={inviteUrl(inv.token)} />
                      {canAssignRole(actorRole, inv.role) ? (
                        <InlineForm action={revokeInvitation}>
                          <input type="hidden" name="slug" value={org.slug} />
                          <input type="hidden" name="id" value={inv.id} />
                          <ConfirmSubmit message={`Revoke the invitation for ${inv.email}?`} className="text-red-600 hover:bg-red-50">
                            Revoke
                          </ConfirmSubmit>
                        </InlineForm>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        <GovernanceSettings ctx={ctx} />
        <IntakeSettings ctx={ctx} />
      </div>
    </>
  );
}

function RoleBadge({ role }: { role: OrgRole }) {
  const tone = role === "owner" ? "dark" : role === "admin" ? "violet" : role === "editor" ? "blue" : "neutral";
  return <Badge tone={tone}>{labelFrom(ORG_ROLES, role)}</Badge>;
}
