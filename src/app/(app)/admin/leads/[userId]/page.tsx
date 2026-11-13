import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, or, sql } from "drizzle-orm";
import { ArrowLeft, ArrowRight, Building2, Mail } from "lucide-react";
import { db } from "@/db";
import { assessments, contactRequests, memberships, organizations } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Field, PageHeader, Select, Table, Td, Textarea, Th } from "@/components/ui";
import { DIMENSIONS, bandFor, levelById } from "@/lib/assessment";
import { describeContext, summarize } from "@/lib/assessment/server";
import { requireStaff } from "@/lib/auth/session";
import {
  emailDomain,
  ENGAGEMENT_LABELS,
  ENGAGEMENT_TYPES,
  getLead,
  isWorkEmail,
  LEAD_STATUSES,
  leadTimeline,
  RECENT_WINDOW_DAYS,
  SCORE_MAX_POINTS,
  SENIORITY_LABELS,
} from "@/lib/leads";
import { categoryLabel, industryLabel, labelFrom, ORG_ROLES, vendorLabel } from "@/lib/taxonomy";
import { formatDate, timeAgo } from "@/lib/utils";
import { listStaff, visibleOrgIds } from "../../_lib/access";
import { LEAD_STATUS_LABELS, LeadStatusBadge, OrgStatusBadge, ScoreBadge } from "../../_components/badges";
import { setContactRequestHandled, updateLead } from "../actions";

export async function generateMetadata({ params }: PageProps<"/admin/leads/[userId]">): Promise<Metadata> {
  const lead = await getLead((await params).userId);
  return { title: lead ? lead.name : "Lead" };
}

export default async function LeadDetailPage({ params }: PageProps<"/admin/leads/[userId]">) {
  const me = await requireStaff();
  const { userId } = await params;
  const lead = await getLead(userId);
  if (!lead) notFound();

  const [timeline, requests, workspaces, staff, orgIds, leadAssessments] = await Promise.all([
    leadTimeline(userId, 100),
    db
      .select()
      .from(contactRequests)
      .where(or(eq(contactRequests.userId, userId), sql`lower(${contactRequests.email}) = ${lead.email.toLowerCase()}`))
      .orderBy(desc(contactRequests.createdAt)),
    db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, status: organizations.status, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, userId))
      .orderBy(organizations.name),
    listStaff(),
    visibleOrgIds(me),
    db
      .select({ assessment: assessments, orgName: organizations.name, orgSlug: organizations.slug })
      .from(assessments)
      .leftJoin(organizations, eq(organizations.id, assessments.orgId))
      .where(eq(assessments.userId, userId))
      .orderBy(desc(assessments.createdAt))
      .limit(10),
  ]);
  const canOpenOrg = (orgId: string) => orgIds === null || orgIds.includes(orgId);
  const e = lead.signals.engagement;

  return (
    <>
      <Link href="/admin/leads" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" aria-hidden /> All leads
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {lead.name}
            <ScoreBadge score={lead.score} className="text-sm" />
            <LeadStatusBadge status={lead.status} />
          </span>
        }
        description={[lead.jobTitle, lead.company].filter(Boolean).join(" at ") || undefined}
        actions={
          <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-2 text-sm font-medium text-radar-700 hover:underline">
            <Mail className="size-4" aria-hidden /> {lead.email}
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title={`Lead score: ${lead.score.score} / 100`} description={`Tier: ${lead.score.tier}. Each signal's contribution is shown below.`} />
            <CardBody>
              {lead.score.reasons.length === 0 ? (
                <p className="text-sm text-slate-500">No scoring signals yet.</p>
              ) : (
                <ul className="space-y-3">
                  {lead.score.reasons.map((r) => (
                    <li key={r.component} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
                      <span className="text-sm text-slate-700">{r.label}</span>
                      <span className="text-sm font-semibold tabular-nums text-slate-900">+{r.points}</span>
                      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-radar-500"
                          style={{ width: `${Math.min(100, (r.points / SCORE_MAX_POINTS[r.component]) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {leadAssessments[0] ? (
            <AssessmentCard
              latest={leadAssessments[0]}
              total={leadAssessments.length}
              canOpenOrg={canOpenOrg}
            />
          ) : null}

          <Card>
            <CardHeader title="Engagement" description={`Last ${RECENT_WINDOW_DAYS} days vs. all time`} />
            <div className="grid grid-cols-2 gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-5">
              {ENGAGEMENT_TYPES.map((t) => (
                <div key={t} className="bg-white px-4 py-3">
                  <div className="text-xs text-slate-500">{ENGAGEMENT_LABELS[t]}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
                    {e[t].recent}
                    <span className="ml-1 text-xs font-normal text-slate-400">/ {e[t].total}</span>
                  </div>
                </div>
              ))}
            </div>
            {timeline.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">No engagement recorded yet.</p>
              </CardBody>
            ) : (
              <ol className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
                {timeline.map((ev) => (
                  <li key={ev.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                    <span
                      className={
                        ev.type === "cta_click" || ev.type === "contact_request"
                          ? "mt-1.5 size-2 shrink-0 rounded-full bg-red-500"
                          : ev.type.startsWith("digest")
                            ? "mt-1.5 size-2 shrink-0 rounded-full bg-violet-500"
                            : "mt-1.5 size-2 shrink-0 rounded-full bg-radar-500"
                      }
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-slate-700">{ENGAGEMENT_LABELS[ev.type] ?? ev.type}</span>
                      {ev.storyTitle && ev.storySlug ? (
                        <>
                          {" · "}
                          <Link href={`/radar/${ev.storySlug}`} className="text-slate-900 hover:text-radar-700 hover:underline">
                            {ev.storyTitle}
                          </Link>
                        </>
                      ) : null}
                    </div>
                    <time dateTime={ev.createdAt.toISOString()} title={ev.createdAt.toLocaleString("en-US")} className="shrink-0 text-xs text-slate-500">
                      {timeAgo(ev.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Contact requests" description="Submissions from the “Talk to North Labs” form" />
            {requests.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">This lead hasn’t asked to talk yet.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500">
                        {formatDate(r.createdAt)}
                        {r.source ? ` · via ${r.source}` : ""}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{r.message || <em className="text-slate-400">No message</em>}</p>
                    </div>
                    <form action={setContactRequestHandled} className="shrink-0">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="handled" value={r.handledAt ? "0" : "1"} />
                      {r.handledAt ? (
                        <SubmitButton variant="ghost" size="sm" pendingText="…">
                          Handled {formatDate(r.handledAt, { month: "short", day: "numeric" })} · Reopen
                        </SubmitButton>
                      ) : (
                        <SubmitButton variant="secondary" size="sm" pendingText="…">
                          Mark handled
                        </SubmitButton>
                      )}
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Pipeline" description={lead.ownerName ? `Owned by ${lead.ownerName}` : "Unassigned"} />
            <CardBody>
              <ActionForm action={updateLead.bind(null, lead.id)}>
                <Field label="Status" htmlFor="status">
                  <Select key={lead.status} id="status" name="status" defaultValue={lead.status}>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Owner" htmlFor="ownerId">
                  <Select key={lead.ownerId ?? ""} id="ownerId" name="ownerId" defaultValue={lead.ownerId ?? ""}>
                    <option value="">Unassigned</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.id === me.id ? " (you)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Notes" htmlFor="notes" hint="Internal only. Included in the CRM export.">
                  <Textarea id="notes" name="notes" rows={6} maxLength={10_000} defaultValue={lead.notes ?? ""} />
                </Field>
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Profile" />
            <CardBody>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <Row label="Company" value={lead.company} />
                <Row label="Title" value={lead.jobTitle} />
                <Row label="Seniority" value={SENIORITY_LABELS[lead.score.seniority]} />
                <Row label="Industry" value={lead.industry ? industryLabel(lead.industry) : null} />
                <Row label="Size" value={lead.companySize ? `${lead.companySize} employees` : null} />
                <Row
                  label="Email"
                  value={
                    <>
                      {emailDomain(lead.email)}{" "}
                      {isWorkEmail(lead.email) ? <Badge tone="radar">work</Badge> : <Badge>personal</Badge>}
                    </>
                  }
                />
                <Row label="Signed up" value={formatDate(lead.signedUpAt)} />
                <Row label="Onboarded" value={lead.onboardedAt ? formatDate(lead.onboardedAt) : "Not yet"} />
                <Row label="Digest" value={lead.digestFrequency ? capitalize(lead.digestFrequency) : "Not set"} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Interests" />
            <CardBody className="space-y-3">
              <InterestGroup label="Topics" items={lead.interests.categories.map(categoryLabel)} />
              <InterestGroup label="Vendors" items={lead.interests.vendors.map(vendorLabel)} />
              <InterestGroup label="Industries" items={lead.interests.industries.map(industryLabel)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Workspaces" description="Client workspaces this person belongs to" />
            {workspaces.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">Not a member of any workspace.</p>
              </CardBody>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Workspace</Th>
                    <Th>Role</Th>
                  </tr>
                </thead>
                <tbody>
                  {workspaces.map((w) => (
                    <tr key={w.id}>
                      <Td>
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="size-4 text-slate-400" aria-hidden />
                          {canOpenOrg(w.id) ? (
                            <Link href={`/admin/workspaces/${w.id}`} className="font-medium text-slate-900 hover:text-radar-700">
                              {w.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-900">{w.name}</span>
                          )}
                        </span>
                        {w.status === "suspended" ? (
                          <div className="mt-1">
                            <OrgStatusBadge status={w.status} />
                          </div>
                        ) : null}
                      </Td>
                      <Td>{labelFrom(ORG_ROLES, w.role)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function AssessmentCard({
  latest,
  total,
  canOpenOrg,
}: {
  latest: { assessment: typeof assessments.$inferSelect; orgName: string | null; orgSlug: string | null };
  total: number;
  canOpenOrg: (orgId: string) => boolean;
}) {
  const a = latest.assessment;
  const { context, overall, recs } = summarize(a);
  const level = levelById(a.level)?.label ?? a.level;
  const barTone = { foundational: "bg-amber-500", developing: "bg-sky-600", strength: "bg-radar-500" } as const;
  return (
    <Card>
      <CardHeader
        title="AI readiness assessment"
        description={`Completed ${formatDate(a.createdAt)}${a.source ? ` · via ${a.source}` : ""}${total > 1 ? ` · latest of ${total}` : ""}`}
        action={
          <Link href={`/assessment/${a.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-radar-700 hover:underline">
            Full report <ArrowRight className="size-4" aria-hidden />
          </Link>
        }
      />
      <CardBody className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-[140px_1fr]">
          <div>
            <div className="text-3xl font-semibold tabular-nums text-slate-900">
              {overall}
              <span className="text-base font-normal text-slate-400">/100</span>
            </div>
            <Badge tone="dark" className="mt-1">
              {level}
            </Badge>
            {recs.priorities.length ? (
              <p className="mt-3 text-xs text-slate-500">
                Weakest: <span className="text-slate-700">{recs.priorities.map((p) => p.label).join(", ")}</span>
              </p>
            ) : null}
          </div>
          <ul className="space-y-2">
            {DIMENSIONS.map((d) => {
              const v = Number(a.scores[d.id] ?? 0);
              return (
                <li key={d.id} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-3 text-sm">
                  <span className="truncate text-slate-600">{d.label}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <span className={`block h-full rounded-full ${barTone[bandFor(v)]}`} style={{ width: `${Math.max(2, v)}%` }} />
                  </span>
                  <span className="text-right font-medium tabular-nums text-slate-900">{v}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <dl className="grid gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
          {describeContext(context).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="text-slate-900">{v}</dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Starter workspace</dt>
            <dd className="text-slate-900">
              {a.orgId && latest.orgName ? (
                canOpenOrg(a.orgId) ? (
                  <Link href={`/admin/workspaces/${a.orgId}`} className="font-medium text-radar-700 hover:underline">
                    {latest.orgName}
                  </Link>
                ) : (
                  latest.orgName
                )
              ) : (
                <span className="text-slate-400">Not created</span>
              )}
            </dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-slate-900">{value ?? <span className="text-slate-400">—</span>}</dd>
    </>
  );
}

function InterestGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-1">
          {items.map((i) => (
            <Badge key={i}>{i}</Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">None selected</p>
      )}
    </div>
  );
}
