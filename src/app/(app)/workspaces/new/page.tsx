import { ArrowRight, Check, Handshake, Info, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Alert, ButtonLink, Card, Field, Input, Select } from "@/components/ui";
import { db } from "@/db";
import { companyNameFor } from "@/lib/assessment/server";
import { requireUser } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plans";
import { INDUSTRIES } from "@/lib/taxonomy";
import { checkWorkspaceCreation } from "@/lib/workspace-creation";
import { createWorkspace } from "./actions";
import { loadCreationFacts } from "./data";

export const metadata: Metadata = { title: "Create a free AI workspace" };

export default async function NewWorkspacePage() {
  const me = await requireUser("/workspaces/new");
  const facts = await loadCreationFacts(db, me);
  const check = checkWorkspaceCreation(facts);
  const domainWs = facts.domainWorkspace;
  const defaultName = companyNameFor(me).slice(0, 120);
  const defaultIndustry = INDUSTRIES.some((i) => i.slug === me.industry) ? (me.industry ?? "") : "";

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-14">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-radar-700">{BRAND} Workspace · Free</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Create your company’s AI workspace</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
          One place to prioritize every AI initiative, track its impact and the data it depends on. Free for up to {PLANS.free.initiativeLimit} initiatives — no card,
          no sales call.
        </p>

        <Card className="mt-6 p-5 sm:p-6">
          {check.ok ? (
            <ActionForm action={createWorkspace} className="space-y-5">
              {check.nudge === "personal_email" ? (
                <Alert tone="warning" className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>
                    You’re signed in with a personal email ({me.email}). That works, but colleagues can’t find your workspace by company domain, and features like the
                    idea intake link work best with work addresses. Consider{" "}
                    <Link href="/sign-up?next=%2Fworkspaces%2Fnew" className="font-medium underline">
                      signing up with your work email
                    </Link>
                    .
                  </span>
                </Alert>
              ) : null}
              <Field label="Workspace name" htmlFor="ws-name" hint="Usually your company name. You can change it later.">
                <Input id="ws-name" name="name" required minLength={2} maxLength={120} defaultValue={defaultName} autoComplete="organization" />
              </Field>
              <Field label="Industry" htmlFor="ws-industry" hint="Tunes Radar alerts and starter suggestions to your sector.">
                <Select id="ws-industry" name="industry" defaultValue={defaultIndustry}>
                  <option value="">Choose an industry (optional)</option>
                  {INDUSTRIES.map((i) => (
                    <option key={i.slug} value={i.slug}>
                      {i.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">You’ll be the workspace owner and can invite colleagues right away.</p>
                <SubmitButton size="lg" pendingText="Creating…">
                  Create free workspace <ArrowRight className="size-4" />
                </SubmitButton>
              </div>
            </ActionForm>
          ) : check.reason === "domain_exists" && domainWs ? (
            <div className="space-y-4">
              <div className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-radar-50 text-radar-700 ring-1 ring-radar-200">
                  <Users className="size-4" />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-900">
                    {domainWs.isMember ? `You’re already in ${domainWs.name}’s workspace` : `Your company already has a free workspace`}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {domainWs.isMember
                      ? "Each company gets one free workspace so everyone works from the same AI portfolio."
                      : check.message}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {domainWs.isMember ? (
                  <ButtonLink href={`/w/${domainWs.slug}`}>
                    Open {domainWs.name} <ArrowRight className="size-4" />
                  </ButtonLink>
                ) : null}
                <ButtonLink href="/contact?from=workspace_new_domain" variant="secondary">
                  Talk to North Labs
                </ButtonLink>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert tone="warning">{check.message}</Alert>
              <ButtonLink href="/contact?from=workspace_new_limit" variant="secondary">
                Talk to North Labs
              </ButtonLink>
            </div>
          )}
        </Card>
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Included free</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {PLANS.free.highlights.map((h) => (
              <li key={h} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-radar-600" aria-hidden />
                {h}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Need more? Team and Business add more initiatives, company-wide idea intake, governance approvals and MCP access.{" "}
            <Link href="/pricing" className="font-medium text-radar-700 hover:underline">
              See pricing
            </Link>
          </p>
        </Card>
        <div className="rounded-xl bg-ink-900 p-5 text-white">
          <Handshake className="size-5 text-radar-400" />
          <h2 className="mt-2 font-semibold">Rather have it set up for you?</h2>
          <p className="mt-1 text-sm text-slate-300">North Labs can launch your portfolio with your leadership team, or run it alongside you. Entirely optional.</p>
          <Link href="/contact?from=workspace_new" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-radar-400 hover:underline">
            Have North Labs set it up <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </aside>
    </div>
  );
}
