import { inArray } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, CircleDot, Clock, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Card, CardBody, CardHeader, Field, Select, Textarea } from "@/components/ui";
import { db } from "@/db";
import { user, type Initiative, type Organization } from "@/db/schema";
import {
  approvalInForce,
  canDecide,
  canRequestReview,
  governanceIssues,
  isApproved,
  isoDate,
  maxSensitivity,
  reviewState,
  stageRequiresApproval,
  suggestRiskTier,
  yesNo,
} from "@/lib/governance";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { enforcedGovernancePolicy } from "@/lib/billing/entitlements";
import { hasFeature } from "@/lib/plans";
import { HUMAN_OVERSIGHT_LEVELS, RISK_TIERS, STAGES, labelFrom } from "@/lib/taxonomy";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { SensitivityBadge } from "../../_components/badges";
import { InlineForm } from "../../_components/client";
import { applySuggestedTier, decideReview, requestReview, saveClassification } from "../../governance/actions";
import { loadDependencySensitivities, loadGovernanceTimeline } from "../../governance/data";
import { ApprovalBadge, GovernanceDisclaimer, OversightText, ReviewDue, RiskTierBadge, describeGovernanceEvent } from "../../governance/governance-ui";

/**
 * Governance panel on the initiative page: risk classification, oversight, approval workflow.
 * Editors classify and request reviews; owners/admins (and assigned consultants) decide them.
 */
export async function GovernanceSection({
  slug,
  org,
  initiative: i,
  canEdit,
  canApprove,
}: {
  slug: string;
  org: Organization;
  initiative: Initiative;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const ctx = await getWorkspaceOrNotFound(slug);
  // Classification is on every plan; the review/approval workflow and the stage gate need governance_workflow.
  const workflow = hasFeature(org.plan, "governance_workflow");
  const policy = enforcedGovernancePolicy(org);
  const today = isoDate(new Date());
  const peopleIds = [i.approvalRequestedById, i.approvalDecidedById].filter((x): x is string => Boolean(x));
  const [deps, timeline, people] = await Promise.all([
    loadDependencySensitivities(org.id, i.id),
    loadGovernanceTimeline(org.id, i.id),
    peopleIds.length ? db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, peopleIds)) : Promise.resolve([]),
  ]);
  const nameOf = (id: string | null) => (id ? (people.find((p) => p.id === id)?.name ?? "Former member") : null);

  const maxData = maxSensitivity(deps.map((d) => d.sensitivity));
  const suggestion = suggestRiskTier({ ...i, maxSensitivity: maxData });
  const issues = governanceIssues(i, { policy, today, maxSensitivity: maxData });
  const review = reviewState(i, today);
  const gatedStages = policy.approvalRequiredStages.map((s) => labelFrom(STAGES, s));
  const showSuggestion = suggestion.tier !== "unclassified" && suggestion.tier !== i.riskTier && i.riskTier !== "prohibited";
  const decided = isApproved(i.approvalStatus) || i.approvalStatus === "rejected";
  // After a reopen the request/decision columns keep their old values; only show them while they apply.
  const currentRequest = i.approvalStatus !== "not_submitted" ? i.approvalRequestedAt : null;
  const classificationComplete = i.riskTier !== "unclassified" && i.customerFacing != null && i.affectsIndividuals != null && i.humanOversight != null;
  const requestable = workflow && canEdit && !i.archivedAt && canRequestReview(i, today);
  const decidable = workflow && canApprove && !i.archivedAt && canDecide(i.approvalStatus);
  const nextGated = policy.approvalRequiredStages.find((s) => STAGES.findIndex((x) => x.slug === s) > STAGES.findIndex((x) => x.slug === i.stage));
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="initiativeId" value={i.id} />
    </>
  );

  const decisionForm = (
    <>
        {i.approvalStatus === "pending" ? <h3 className="text-sm font-semibold text-slate-900">Decide this review</h3> : null}
        <p className="mt-0.5 text-xs text-slate-500">
          {i.approvalStatus === "pending"
            ? "Approving sets the next review date"
            : "Renewing the approval resets the next review date"}{" "}
          ({policy.reviewIntervalMonths} months from today).
          {i.approvalRequestedById === ctx.user.id ? " You requested this review yourself — the register records it as self-approved." : ""}
        </p>
        <ActionForm action={decideReview} className="mt-3 space-y-3" resetOnSuccess>
          {hidden}
          <fieldset>
            <legend className="sr-only">Decision</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DECISIONS.map((d) => (
                <label
                  key={d.value}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm has-checked:border-radar-600 has-checked:bg-radar-50"
                >
                  <input type="radio" name="decision" value={d.value} required className="mt-0.5 accent-radar-600" />
                  <span>
                    <span className="block font-medium text-slate-900">{d.label}</span>
                    <span className="block text-xs text-slate-500">{d.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Conditions or reason" htmlFor={`gov-note-${i.id}`} hint="Required for “with conditions” and “not approved”. Shared with the requester.">
            <Textarea id={`gov-note-${i.id}`} name="note" rows={3} maxLength={2000} placeholder="e.g. Human review of every outbound reply until accuracy is above 95%; re-check after the CRM migration." />
          </Field>
          <SubmitButton size="sm">Record decision</SubmitButton>
        </ActionForm>
    </>
  );

  return (
    <Card id="governance" className="scroll-mt-24">
      <CardHeader
        title="AI governance"
        description="Risk classification, human oversight and approval — this initiative’s entry in the AI use-case register."
        action={<ApprovalBadge status={i.approvalStatus} />}
      />
      <CardBody className="space-y-5">
        {stageRequiresApproval(policy, i.stage) && !approvalInForce(i, today) && i.stage !== "retired" ? (
          <Alert tone="warning" className="flex gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Workspace policy requires an approved review for {labelFrom(STAGES, i.stage)}, and this initiative doesn’t have one in force. It can stay where it
              is, but it will be flagged in the{" "}
              <Link href={`/w/${slug}/governance`} className="font-medium underline">
                register
              </Link>{" "}
              until it’s approved.
            </span>
          </Alert>
        ) : nextGated && !approvalInForce(i, today) && !i.archivedAt ? (
          <Alert tone="neutral" className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-500" />
            <span>Needs an approved review before it can move to {labelFrom(STAGES, nextGated)} (workspace policy).</span>
          </Alert>
        ) : null}

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Fact label="Risk tier">
            <RiskTierBadge tier={i.riskTier} />
          </Fact>
          <Fact label="Most sensitive data">
            {maxData ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <SensitivityBadge sensitivity={maxData} />
                <span className="text-xs text-slate-500">
                  across {deps.length} data dependenc{deps.length === 1 ? "y" : "ies"}
                </span>
              </span>
            ) : (
              <span className="text-slate-400">No data dependencies</span>
            )}
          </Fact>
          <Fact label="Customer-facing">
            <Answer value={i.customerFacing} />
          </Fact>
          <Fact label="Informs decisions about individuals">
            <Answer value={i.affectsIndividuals} warnYes />
          </Fact>
          <Fact label="Human oversight">
            <OversightText level={i.humanOversight} />
          </Fact>
          <Fact label="Next review">
            <ReviewDue due={i.reviewDueOn} state={review} />
          </Fact>
        </dl>

        {showSuggestion ? (
          <div className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-sm text-violet-950">
              <Sparkles className="mr-1 inline size-3.5 -translate-y-px text-violet-600" />
              <span className="font-medium">Suggested tier: {labelFrom(RISK_TIERS, suggestion.tier)}.</span> {suggestion.explanation}
            </p>
            {canEdit ? (
              <InlineForm action={applySuggestedTier} className="shrink-0">
                {hidden}
                <SubmitButton size="sm" variant="secondary" pendingText="Applying…">
                  Use suggestion
                </SubmitButton>
              </InlineForm>
            ) : null}
          </div>
        ) : suggestion.tier === "unclassified" && i.riskTier === "unclassified" ? (
          <p className="text-sm text-slate-500">
            <Sparkles className="mr-1 inline size-3.5 -translate-y-px text-slate-400" />
            {suggestion.explanation}
          </p>
        ) : suggestion.tier === i.riskTier && i.riskTier !== "unclassified" ? (
          <p className="text-xs text-slate-500">Matches the suggested tier: {suggestion.explanation}</p>
        ) : null}

        {issues.length > 0 ? (
          <ul className="space-y-1.5">
            {issues.map((x) => (
              <li key={x.code} className={cn("flex items-start gap-2 text-sm", x.severity === "high" ? "text-red-800" : "text-amber-800")}>
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                {x.label}
              </li>
            ))}
          </ul>
        ) : null}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Approval</h3>
          <ol className="space-y-3 border-l border-slate-200 pl-4">
            {currentRequest ? (
              <Step
                icon={<CircleDot className="size-3.5 text-slate-500" />}
                title={`Review requested by ${nameOf(i.approvalRequestedById) ?? "someone"}`}
                meta={`${formatDate(currentRequest)} · ${timeAgo(currentRequest)}`}
              />
            ) : (
              <Step
                icon={<CircleDot className="size-3.5 text-slate-300" />}
                title={i.approvalDecidedAt ? "Reopened — the previous decision no longer applies" : "Review not requested yet"}
                meta={i.approvalDecidedAt ? "A new review is needed; see the governance history below." : undefined}
              />
            )}
            {i.approvalStatus === "pending" ? (
              <Step icon={<Clock className="size-3.5 text-amber-600" />} title="Waiting for an owner or admin to decide" />
            ) : decided && i.approvalDecidedAt ? (
              <Step
                icon={
                  i.approvalStatus === "rejected" ? <XCircle className="size-3.5 text-red-600" /> : <CheckCircle2 className="size-3.5 text-radar-600" />
                }
                title={`${i.approvalStatus === "rejected" ? "Not approved" : i.approvalStatus === "conditional" ? "Approved with conditions" : "Approved"} by ${nameOf(i.approvalDecidedById) ?? "someone"}`}
                meta={`${formatDate(i.approvalDecidedAt)} · ${timeAgo(i.approvalDecidedAt)}`}
              >
                {i.approvalConditions ? (
                  <p className="mt-1.5 rounded-md bg-slate-50 px-2.5 py-1.5 text-sm whitespace-pre-line text-slate-700 ring-1 ring-slate-200 ring-inset">
                    <span className="font-medium text-slate-900">
                      {i.approvalStatus === "conditional" ? "Conditions: " : i.approvalStatus === "rejected" ? "Reason: " : "Note: "}
                    </span>
                    {i.approvalConditions}
                  </p>
                ) : null}
              </Step>
            ) : null}
            {isApproved(i.approvalStatus) && i.reviewDueOn ? (
              <Step
                icon={<Clock className={cn("size-3.5", review === "overdue" ? "text-red-600" : review === "due_soon" ? "text-amber-600" : "text-slate-400")} />}
                title={review === "overdue" ? "Periodic review overdue" : "Next periodic review"}
                meta={`Due ${formatDate(i.reviewDueOn)} · every ${policy.reviewIntervalMonths} months per workspace policy`}
              />
            ) : null}
          </ol>
          {gatedStages.length > 0 ? (
            <p className="mt-3 text-xs text-slate-500">Workspace policy: approval required before {gatedStages.join(" and ")}.</p>
          ) : null}
          {!workflow ? (
            <UpgradePrompt
              feature="governance_workflow"
              slug={slug}
              canManageBilling={ctx.can("billing:manage")}
              compact
              title="Review requests and approvals"
              className="mt-3"
            />
          ) : null}
        </div>

        {i.governanceNotes ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Governance notes</h3>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-800">{i.governanceNotes}</p>
          </div>
        ) : null}
      </CardBody>

      {decidable ? (
        <div className={cn("border-t border-slate-100 px-5 py-4", i.approvalStatus === "pending" && "bg-slate-50/50")}>
          {i.approvalStatus === "pending" ? (
            decisionForm
          ) : (
            <details>
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                Record a re-review <span className="font-normal text-slate-500">(renews the approval or changes the decision)</span>
              </summary>
              <div className="mt-3">
                {decisionForm}
              </div>
            </details>
          )}
        </div>
      ) : null}

      {canEdit && !i.archivedAt ? (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          {requestable ? (
            classificationComplete ? (
              <ActionForm action={requestReview} className="space-y-2" resetOnSuccess>
                {hidden}
                <Field
                  label={i.approvalStatus === "rejected" ? "Request a new review" : isApproved(i.approvalStatus) ? "Request a re-review" : "Request a review"}
                  htmlFor={`gov-request-${i.id}`}
                  hint="Owners, admins and your North Labs consultant will be notified by email."
                >
                  <Textarea id={`gov-request-${i.id}`} name="note" rows={2} maxLength={2000} placeholder="Anything reviewers should know (optional)" className="min-h-16" />
                </Field>
                <SubmitButton size="sm" variant="secondary" pendingText="Requesting…">
                  <ShieldCheck className="size-4" /> Request review
                </SubmitButton>
              </ActionForm>
            ) : (
              <p className="text-sm text-slate-500">Complete the classification (risk tier, customer-facing, individuals, oversight) to request a review.</p>
            )
          ) : null}

          <details open={i.riskTier === "unclassified"} className="group">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              <span className="text-slate-400 group-open:hidden">+ </span>
              <span className="hidden text-slate-400 group-open:inline">– </span>
              Edit classification
            </summary>
            <ActionForm action={saveClassification} className="mt-3 space-y-3">
              {hidden}
              {decided ? (
                <Alert tone="warning">
                  Changing the risk tier, audience, impact on individuals or oversight will reopen this review: the current decision stops applying until it’s
                  reviewed again.
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Risk tier" htmlFor={`gov-tier-${i.id}`} hint={RISK_TIERS.find((t) => t.slug === i.riskTier)?.description}>
                  <Select id={`gov-tier-${i.id}`} name="riskTier" defaultValue={i.riskTier}>
                    {RISK_TIERS.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.label}
                        {t.slug === suggestion.tier && t.slug !== "unclassified" ? " (suggested)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Human oversight" htmlFor={`gov-oversight-${i.id}`}>
                  <Select id={`gov-oversight-${i.id}`} name="humanOversight" defaultValue={i.humanOversight ?? ""}>
                    <option value="">Not recorded</option>
                    {HUMAN_OVERSIGHT_LEVELS.map((o) => (
                      <option key={o.slug} value={o.slug}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Customer-facing?" htmlFor={`gov-cf-${i.id}`} hint="Customers interact with it or see its output.">
                  <TriSelect id={`gov-cf-${i.id}`} name="customerFacing" value={i.customerFacing} />
                </Field>
                <Field label="Informs decisions about individuals?" htmlFor={`gov-ai-${i.id}`} hint="Hiring, credit, health, education, benefits, pricing…">
                  <TriSelect id={`gov-ai-${i.id}`} name="affectsIndividuals" value={i.affectsIndividuals} />
                </Field>
              </div>
              <Field label="Governance notes" htmlFor={`gov-notes-${i.id}`} hint="Controls, monitoring, vendor terms, DPIA or model-card links — whatever reviewers and auditors should see.">
                <Textarea id={`gov-notes-${i.id}`} name="governanceNotes" rows={3} maxLength={5000} defaultValue={i.governanceNotes ?? ""} />
              </Field>
              <SubmitButton size="sm" variant="secondary">
                Save classification
              </SubmitButton>
            </ActionForm>
          </details>
        </div>
      ) : null}

      {timeline.length > 0 ? (
        <div className="border-t border-slate-100 px-5 py-4">
          <details>
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
              Governance history <span className="font-normal text-slate-500">({timeline.length})</span>
            </summary>
            <ol className="mt-3 space-y-2.5">
              {timeline.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-slate-700">
                    <span className="font-medium text-slate-900">{e.userName ?? "Someone"}</span> {describeGovernanceEvent(e.action, e.detail)}
                    {e.detail?.selfApproved ? <span className="text-xs text-slate-500"> (self-approved)</span> : null}
                  </p>
                  {typeof e.detail?.note === "string" && e.detail.note ? <p className="mt-0.5 text-xs whitespace-pre-line text-slate-500">“{e.detail.note}”</p> : null}
                  <time className="text-xs text-slate-500" dateTime={e.createdAt.toISOString()}>
                    {formatDate(e.createdAt)} · {timeAgo(e.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          </details>
        </div>
      ) : null}

      <div className="border-t border-slate-100 px-5 py-3">
        <GovernanceDisclaimer />
      </div>
    </Card>
  );
}

const DECISIONS = [
  { value: "approved", label: "Approve", hint: "Fine to proceed as classified" },
  { value: "conditional", label: "With conditions", hint: "Proceed if the conditions are met" },
  { value: "rejected", label: "Not approved", hint: "Changes needed before it proceeds" },
] as const;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{children}</dd>
    </div>
  );
}

function Answer({ value, warnYes }: { value: boolean | null; warnYes?: boolean }) {
  if (value == null) return <span className="text-slate-400">Not answered</span>;
  return <span className={value && warnYes ? "font-medium text-amber-800" : undefined}>{yesNo(value)}</span>;
}

function Step({ icon, title, meta, children }: { icon: ReactNode; title: string; meta?: string; children?: ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute top-0.5 -left-[1.4rem] flex size-4 items-center justify-center rounded-full bg-white">{icon}</span>
      <p className="text-sm text-slate-800">{title}</p>
      {meta ? <p className="text-xs text-slate-500">{meta}</p> : null}
      {children}
    </li>
  );
}

function TriSelect({ id, name, value }: { id: string; name: string; value: boolean | null }) {
  return (
    <Select id={id} name={name} defaultValue={value == null ? "" : value ? "yes" : "no"}>
      <option value="">Not answered</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </Select>
  );
}
