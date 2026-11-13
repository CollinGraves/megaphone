import { ArrowRightCircle, Copy, XCircle } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, Card, CardBody, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import type { Idea } from "@/db/schema";
import { DEFAULT_TIME_SAVED_SHARE, ideaToInitiativeDefaults } from "@/lib/ideas";
import { IDEA_STATUSES, labelFrom } from "@/lib/taxonomy";
import { formatNumber } from "@/lib/utils";
import { convertIdea, declineIdea, markDuplicate, reviewIdea } from "../actions";

export type DuplicateCandidates = {
  initiatives: { id: string; title: string }[];
  ideas: { id: string; title: string; status: string }[];
};

/** Triage actions for `ideas:triage` holders. Hidden once the idea is accepted. */
export function TriagePanel({
  slug,
  idea,
  businessUnits,
  candidates,
  capMessage,
  billingHref,
}: {
  slug: string;
  idea: Idea;
  businessUnits: string[];
  candidates: DuplicateCandidates;
  /** Set when the workspace is at its plan's initiative limit. */
  capMessage: string | null;
  /** Plan & billing link for people who can upgrade. */
  billingHref: string | null;
}) {
  const defaults = ideaToInitiativeDefaults(idea);
  const closed = idea.status === "declined" || idea.status === "duplicate";
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="id" value={idea.id} />
    </>
  );

  return (
    <Card>
      <CardHeader
        title="Triage"
        description={closed ? `This idea is ${labelFrom(IDEA_STATUSES, idea.status).toLowerCase()}. You can still reopen it or convert it.` : "Decide what happens next. The submitter is emailed when you accept, decline or mark a duplicate."}
      />
      <CardBody className="space-y-6">
        <section aria-labelledby="convert-heading">
          <h3 id="convert-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ArrowRightCircle className="size-4 text-radar-600" /> Convert to initiative
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Creates an initiative in the <span className="font-medium text-slate-700">Idea</span> stage, prefilled with the problem, sizing and submitter, and marks this idea accepted.
          </p>
          {capMessage ? (
            <Alert tone="warning" className="mt-3">
              {capMessage}{" "}
              {billingHref ? (
                <Link href={billingHref} className="font-medium underline">
                  See plans
                </Link>
              ) : (
                "Ask a workspace owner or admin to upgrade."
              )}
            </Alert>
          ) : null}
          <ActionForm action={convertIdea} className="mt-3 space-y-3">
            {hidden}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
              <Field label="Initiative title" htmlFor="convert-title">
                <Input id="convert-title" name="title" required minLength={3} maxLength={160} defaultValue={defaults.initiative.title} />
              </Field>
              <Field label="Business unit" htmlFor="convert-bu">
                <Input id="convert-bu" name="businessUnit" maxLength={100} list="convert-bus" defaultValue={defaults.initiative.businessUnit ?? ""} />
                <datalist id="convert-bus">
                  {businessUnits.map((bu) => (
                    <option key={bu} value={bu} />
                  ))}
                </datalist>
              </Field>
            </div>
            {defaults.metric ? (
              <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm">
                <Checkbox name="includeEstimate" value="1" defaultChecked className="mt-0.5" />
                <span>
                  <span className="font-medium text-slate-900">Add an hours-saved estimate of {formatNumber(defaults.metric.estimatedValue)} h/yr</span>
                  <span className="block text-xs text-slate-500">
                    {Math.round(DEFAULT_TIME_SAVED_SHARE * 100)}% of the ~{formatNumber(defaults.annualHours)} h/yr spent on this today, per the submitter. You can refine it on the initiative.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-slate-500">No hours data on this idea, so no hours-saved estimate will be added. You can add impact metrics on the initiative.</p>
            )}
            <SubmitButton pendingText="Converting…">Convert to initiative</SubmitButton>
          </ActionForm>
        </section>

        <section aria-labelledby="review-heading" className="border-t border-slate-100 pt-5">
          <h3 id="review-heading" className="text-sm font-semibold text-slate-900">
            {idea.status === "under_review" ? "Review notes" : closed ? "Reopen for review" : "Start reviewing"}
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">Internal notes for the AI team — never shown to the submitter.</p>
          <ActionForm action={reviewIdea} className="mt-3 space-y-3">
            {hidden}
            <label htmlFor="triage-notes" className="sr-only">
              Triage notes
            </label>
            <Textarea
              id="triage-notes"
              name="triageNotes"
              rows={3}
              maxLength={5000}
              defaultValue={idea.triageNotes ?? ""}
              placeholder="e.g. Talk to Dana about the SAP export; similar to the invoice matching pilot."
              className="min-h-20"
            />
            <SubmitButton variant="secondary" size="sm">
              {idea.status === "under_review" ? "Save notes" : closed ? "Reopen as under review" : "Move to under review"}
            </SubmitButton>
          </ActionForm>
        </section>

        <div className="grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
          <details className="group rounded-lg border border-slate-200 px-4 py-3 open:pb-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900">
              <XCircle className="size-4 text-slate-400" /> Decline
              <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">Show ›</span>
            </summary>
            <ActionForm action={declineIdea} className="mt-3 space-y-3">
              {hidden}
              <Field label="Reason (shared with the submitter)" htmlFor="decline-reason">
                <Textarea
                  id="decline-reason"
                  name="reason"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={3}
                  defaultValue={idea.status === "declined" ? (idea.declineReason ?? "") : ""}
                  placeholder="e.g. The new ERP release covers this natively next quarter."
                  className="min-h-20"
                />
              </Field>
              <NotifyCheckbox id="decline-notify" />
              <SubmitButton variant="danger" size="sm" pendingText="Declining…">
                Decline idea
              </SubmitButton>
            </ActionForm>
          </details>

          <details className="group rounded-lg border border-slate-200 px-4 py-3 open:pb-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-900">
              <Copy className="size-4 text-slate-400" /> Mark as duplicate
              <span className="ml-auto text-xs font-normal text-slate-400 group-open:hidden">Show ›</span>
            </summary>
            <ActionForm action={markDuplicate} className="mt-3 space-y-3">
              {hidden}
              <Field label="Duplicate of" htmlFor="duplicate-target" hint="Pointing at an initiative links this idea to it, so the submitter can follow along.">
                <Select
                  id="duplicate-target"
                  name="target"
                  required
                  defaultValue={idea.status === "duplicate" ? (idea.duplicateOfId ? `idea:${idea.duplicateOfId}` : idea.initiativeId ? `initiative:${idea.initiativeId}` : "") : ""}
                >
                  <option value="" disabled>
                    Choose an initiative or idea…
                  </option>
                  {candidates.initiatives.length ? (
                    <optgroup label="Initiatives">
                      {candidates.initiatives.map((i) => (
                        <option key={i.id} value={`initiative:${i.id}`}>
                          {i.title}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {candidates.ideas.length ? (
                    <optgroup label="Other ideas">
                      {candidates.ideas.map((i) => (
                        <option key={i.id} value={`idea:${i.id}`}>
                          {i.title} ({labelFrom(IDEA_STATUSES, i.status).toLowerCase()})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </Select>
              </Field>
              <NotifyCheckbox id="duplicate-notify" />
              <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                Mark as duplicate
              </SubmitButton>
            </ActionForm>
          </details>
        </div>
      </CardBody>
    </Card>
  );
}

function NotifyCheckbox({ id }: { id: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-slate-700">
      <Checkbox id={id} name="notify" value="1" defaultChecked /> Email the submitter
    </label>
  );
}
