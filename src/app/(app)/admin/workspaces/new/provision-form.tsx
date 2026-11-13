"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { SubmitButton } from "@/components/forms";
import { Alert, buttonClass, Card, CardBody, CardHeader, Checkbox, Field, Input, Select } from "@/components/ui";
import { slugify } from "@/lib/ingest/heuristics";
import { INDUSTRIES } from "@/lib/taxonomy";
import { CopyField } from "../../_components/copy-button";
import { PLAN_LABELS } from "../../_components/badges";
import { provisionWorkspace, type ProvisionState } from "../actions";

type Consultant = { id: string; name: string; email: string };

const PLAN_HINTS: Record<keyof typeof PLAN_LABELS, string> = {
  engagement: "Included with a North Labs consulting engagement",
  trial: "Time-boxed evaluation",
  pro: "Paid self-serve tier (billing coming soon)",
  enterprise: "Custom contract",
};

const toSlug = (name: string) => (name.trim() ? slugify(name, 48) : "");

export function ProvisionForm({ consultants }: { consultants: Consultant[] }) {
  // Remounting the inner form is the simplest way to clear useActionState for "Provision another".
  const [formKey, setFormKey] = useState(0);
  return <ProvisionFormInner key={formKey} consultants={consultants} onReset={() => setFormKey((k) => k + 1)} />;
}

function ProvisionFormInner({ consultants, onReset }: { consultants: Consultant[]; onReset: () => void }) {
  const [state, formAction] = useActionState<ProvisionState, FormData>(provisionWorkspace, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  if (state?.org) {
    const { org, invite, inviteError } = state;
    return (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-radar-600" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{org.name} is ready</h2>
              <p className="text-sm text-slate-600">
                The workspace lives at <span className="font-mono">/w/{org.slug}</span>.
              </p>
            </div>
          </div>
          {invite?.status === "invited" && invite.url ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                We emailed an owner invitation to <strong>{invite.email}</strong>. You can also share the link directly:
              </p>
              <CopyField value={invite.url} />
              <p className="text-xs text-slate-500">The link expires in 14 days and only works for {invite.email}.</p>
            </div>
          ) : invite?.status === "added" ? (
            <Alert tone="success">
              {invite.email} already had an AI Radar account and was added as the workspace owner.
            </Alert>
          ) : null}
          {inviteError ? (
            <Alert tone="warning">
              The workspace was created but the owner invitation failed: {inviteError}. Invite the owner from the workspace page.
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/workspaces/${org.id}`} className={buttonClass("primary")}>
              Manage workspace
            </Link>
            <Link href={`/w/${org.slug}`} className={buttonClass("secondary")}>
              Open workspace
            </Link>
            <button type="button" onClick={onReset} className={buttonClass("ghost")}>
              Provision another
            </button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const v = state?.values;
  return (
    // Keyed on the echoed values: remounting re-applies defaults that React's post-action form reset
    // (notably for <select>) would otherwise discard.
    <form key={v ? JSON.stringify(v) : "initial"} action={formAction} className="space-y-6">
      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Card>
        <CardHeader title="Client" description="Who the workspace is for." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Workspace name" htmlFor="name" className="sm:col-span-2">
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="Acme Corporation"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(toSlug(e.target.value));
              }}
            />
          </Field>
          <Field label="URL slug" htmlFor="slug" hint={`Workspace URL: /w/${slug || "your-slug"}`}>
            <Input
              id="slug"
              name="slug"
              required
              minLength={2}
              maxLength={48}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Lowercase letters, numbers and single hyphens"
              value={slug}
              onChange={(e) => {
                setSlugEdited(e.target.value !== "");
                setSlug(e.target.value.toLowerCase());
              }}
              onBlur={() => setSlug((s) => toSlug(s))}
            />
          </Field>
          <Field label="Industry" htmlFor="industry">
            <Select id="industry" name="industry" defaultValue={v?.industry ?? ""}>
              <option value="">Not specified</option>
              {INDUSTRIES.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Plan" description="Billing is managed by North Labs for now." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan" htmlFor="plan">
            <Select id="plan" name="plan" defaultValue={v?.plan || "engagement"}>
              {(Object.keys(PLAN_LABELS) as (keyof typeof PLAN_LABELS)[]).map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABELS[p]} — {PLAN_HINTS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default loaded hourly rate (USD)" htmlFor="defaultHourlyRate" hint="Converts hours saved into dollars.">
            <Input id="defaultHourlyRate" name="defaultHourlyRate" type="number" min={0} max={10000} step="1" defaultValue={v?.defaultHourlyRate || 75} required />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="People" description="The owner gets an invitation email; consultants get immediate access." />
        <CardBody className="space-y-4">
          <Field label="Owner email" htmlFor="ownerEmail" hint="The client's workspace owner. They can invite their own team.">
            <Input id="ownerEmail" name="ownerEmail" type="email" required placeholder="cto@acme.com" autoComplete="off" defaultValue={v?.ownerEmail} />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Assign consultants</legend>
            {consultants.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">
                No consultants yet. Give a staff member the consultant role on the Users page.
              </p>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {consultants.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                    <Checkbox name="consultantIds" value={c.id} defaultChecked={v?.consultantIds.includes(c.id)} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                      <span className="block truncate text-xs text-slate-500">{c.email}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </CardBody>
      </Card>

      <div className="flex justify-end">
        <SubmitButton variant="accent" pendingText="Provisioning…">
          Provision workspace
        </SubmitButton>
      </div>
    </form>
  );
}
