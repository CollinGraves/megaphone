import { eq } from "drizzle-orm";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, Field, Input } from "@/components/ui";
import { db } from "@/db";
import { memberships, user } from "@/db/schema";
import { workDomainsFrom } from "@/lib/ideas";
import type { WorkspaceContext } from "@/lib/workspace";
import { CopyButton, InlineForm } from "../_components/client";
import { intakeUrl } from "../ideas/_lib/server";
import { disableIntakeLink, enableIntakeLink, rotateIntakeLink, saveIntakeDomains } from "./intake-actions";

/** Idea-intake link settings: enable/disable/rotate the public link and the allowed email domains. */
export async function IntakeSettings({ ctx }: { ctx: WorkspaceContext }) {
  const { org } = ctx;
  const canSettings = ctx.can("settings:manage");
  const token = org.intakeToken;
  const url = token ? intakeUrl(token) : null;
  const domains = org.intakeAllowedDomains;

  // Suggest the members' company domains when nothing is configured yet.
  const suggested =
    canSettings && domains.length === 0 && !token
      ? workDomainsFrom(
          (
            await db
              .select({ email: user.email })
              .from(memberships)
              .innerJoin(user, eq(memberships.userId, user.id))
              .where(eq(memberships.orgId, org.id))
          ).map((r) => r.email),
        )
      : [];
  const who = domains.length ? domains.map((d) => `@${d}`).join(", ") : "any work email";
  const hidden = <input type="hidden" name="slug" value={org.slug} />;

  return (
    <Card id="intake" className="scroll-mt-24">
      <CardHeader
        title="Idea intake link"
        description={
          <>
            A shareable link where anyone at {org.name} can submit an AI idea with their work email — no account needed. Submissions land in{" "}
            <Link href={`/w/${org.slug}/ideas`} className="underline hover:text-slate-800">
              Ideas
            </Link>{" "}
            for triage. Members can also submit ideas from inside the workspace.
          </>
        }
        action={token ? <Badge tone="radar">On</Badge> : <Badge>Off</Badge>}
      />
      <CardBody className="space-y-5">
        {url ? (
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <Link2 className="size-4 shrink-0 text-slate-400" />
                <code className="min-w-0 truncate font-mono text-xs text-slate-800" title={url}>
                  {url}
                </code>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <CopyButton value={url} />
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="size-3.5" /> Open
                </a>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Accepts ideas from <span className="font-medium text-slate-700">{who}</span>. Share it on your intranet, in Slack or Teams, or in a company-wide email.
            </p>
            {canSettings ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <InlineForm action={rotateIntakeLink}>
                  {hidden}
                  <ConfirmSubmit message="Create a new link? The current link will stop working immediately." variant="secondary">
                    <RefreshCw className="size-3.5" /> New link
                  </ConfirmSubmit>
                </InlineForm>
                <InlineForm action={disableIntakeLink}>
                  {hidden}
                  <ConfirmSubmit message="Turn off the intake link? It will stop working immediately. Existing ideas are kept." className="text-red-600 hover:bg-red-50">
                    Turn off
                  </ConfirmSubmit>
                </InlineForm>
              </div>
            ) : null}
          </div>
        ) : canSettings ? (
          <ActionForm action={enableIntakeLink} className="space-y-3">
            {hidden}
            <p className="text-sm text-slate-600">
              The link is off. Turning it on creates a private, unguessable URL{suggested.length ? ` that accepts ideas from ${suggested.map((d) => `@${d}`).join(", ")} emails` : ""}. You can turn it off or replace it at any time.
            </p>
            <SubmitButton size="sm" pendingText="Turning on…">
              Turn on intake link
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-sm text-slate-500">The intake link is off. Ask a workspace admin to turn it on.</p>
        )}

        {canSettings ? (
          <ActionForm action={saveIntakeDomains} className="space-y-3 border-t border-slate-100 pt-5">
            {hidden}
            <Field
              label="Allowed email domains"
              htmlFor="intake-domains"
              hint="Comma-separated. Subdomains are included (acme.com also allows eu.acme.com). Leave empty to accept any work email; personal addresses like Gmail are always refused."
            >
              <Input
                id="intake-domains"
                name="domains"
                maxLength={2000}
                defaultValue={(domains.length ? domains : suggested).join(", ")}
                placeholder="e.g. acme.com, acme-labs.io"
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            {suggested.length && !domains.length ? <p className="text-xs text-slate-500">Prefilled from your members’ email domains.</p> : null}
            <SubmitButton size="sm" variant="secondary">
              Save domains
            </SubmitButton>
          </ActionForm>
        ) : null}
      </CardBody>
    </Card>
  );
}
