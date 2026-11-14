import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, CardBody, CardHeader, Checkbox, Field, Select } from "@/components/ui";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { GATEABLE_STAGES, REVIEW_INTERVAL_OPTIONS, approvalInForce, isoDate, normalizePolicy } from "@/lib/governance";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { hasFeature } from "@/lib/plans";
import { STAGES, labelFrom } from "@/lib/taxonomy";
import type { WorkspaceContext } from "@/lib/workspace";
import { GovernanceDisclaimer } from "../governance/governance-ui";
import { updateGovernancePolicy } from "./governance-actions";

const STAGE_HINTS: Record<string, string> = {
  pilot: "Real users or real data, limited rollout",
  production: "Generally available to its audience",
};

/** Governance policy settings (approval-gated stages, review interval). */
export async function GovernanceSettings({ ctx }: { ctx: WorkspaceContext }) {
  const policy = normalizePolicy(ctx.org.governancePolicy);
  if (!hasFeature(ctx.org.plan, "governance_workflow")) {
    const saved = policy.approvalRequiredStages.map((s) => labelFrom(STAGES, s));
    return (
      <Card>
        <CardHeader
          title="AI governance policy"
          description="Require an approved governance review before initiatives move to pilot or production, and set how often approvals are re-reviewed."
        />
        <CardBody className="space-y-3">
          <UpgradePrompt
            feature="governance_workflow"
            slug={ctx.org.slug}
            canManageBilling={ctx.can("billing:manage")}
            description="Review requests, owner/admin approvals, an approval gate before pilot or production, and weekly reminders when reviews are due. Risk classification and the use-case register stay available on every plan."
          >
            {saved.length ? (
              <p className="mt-1.5 text-sm text-slate-600">Your saved policy (approval before {saved.join(" and ")}) is kept and applies again when you upgrade.</p>
            ) : null}
          </UpgradePrompt>
        </CardBody>
      </Card>
    );
  }
  const canSettings = ctx.can("settings:manage");
  const today = isoDate(new Date());
  const live = await db
    .select({ stage: initiatives.stage, approvalStatus: initiatives.approvalStatus, reviewDueOn: initiatives.reviewDueOn })
    .from(initiatives)
    .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt), inArray(initiatives.stage, [...GATEABLE_STAGES])));
  const unapproved = Object.fromEntries(GATEABLE_STAGES.map((s) => [s, live.filter((i) => i.stage === s && !approvalInForce(i, today)).length]));
  const gated = policy.approvalRequiredStages.map((s) => labelFrom(STAGES, s));

  return (
    <Card>
      <CardHeader
        title="AI governance policy"
        description={
          <>
            When initiatives need an approved governance review, and how often approvals are re-reviewed. Reviews are decided by owners and admins in the{" "}
            <Link href={`/w/${ctx.org.slug}/governance`} className="underline hover:text-slate-800">
              AI use-case register
            </Link>
            .
          </>
        }
      />
      <CardBody>
        {canSettings ? (
          <ActionForm action={updateGovernancePolicy} className="space-y-5">
            <input type="hidden" name="slug" value={ctx.org.slug} />
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Require an approved review before an initiative moves to</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {GATEABLE_STAGES.map((s) => (
                  <label key={s} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 has-checked:border-radar-600 has-checked:bg-radar-50/60">
                    <Checkbox name="approvalRequiredStages" value={s} defaultChecked={policy.approvalRequiredStages.includes(s)} className="mt-0.5" />
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-slate-900">{labelFrom(STAGES, s)}</span>
                      <span className="block text-xs text-slate-500">{STAGE_HINTS[s]}</span>
                      {unapproved[s] > 0 ? (
                        <span className="mt-1 block text-xs text-amber-800">
                          {unapproved[s]} initiative{unapproved[s] === 1 ? " is" : "s are"} already in {labelFrom(STAGES, s)} without an approval. They stay
                          put but are flagged in the register.
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field
              label="Re-review approvals every"
              htmlFor="gov-interval"
              hint="Sets the review due date when an approval is recorded. Existing due dates don’t change."
              className="max-w-xs"
            >
              <Select id="gov-interval" name="reviewIntervalMonths" defaultValue={String(policy.reviewIntervalMonths)}>
                {REVIEW_INTERVAL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} months
                  </option>
                ))}
                {!(REVIEW_INTERVAL_OPTIONS as readonly number[]).includes(policy.reviewIntervalMonths) ? (
                  <option value={policy.reviewIntervalMonths}>{policy.reviewIntervalMonths} months</option>
                ) : null}
              </Select>
            </Field>
            <SubmitButton size="sm">Save policy</SubmitButton>
          </ActionForm>
        ) : (
          <dl className="grid grid-cols-[minmax(0,12rem)_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">Approval required before</dt>
            <dd className="text-slate-900">{gated.length ? gated.join(", ") : "No stage (approvals are optional)"}</dd>
            <dt className="text-slate-500">Re-review approvals every</dt>
            <dd className="text-slate-900">{policy.reviewIntervalMonths} months</dd>
          </dl>
        )}
        <GovernanceDisclaimer className="mt-5" />
      </CardBody>
    </Card>
  );
}
