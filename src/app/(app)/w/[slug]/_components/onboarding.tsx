import { ArrowRight, CheckCircle2, Circle, PartyPopper, Rocket } from "lucide-react";
import Link from "next/link";
import { ConfirmSubmit } from "@/components/forms";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { BRAND_COMPANY } from "@/lib/brand";
import { checklistMode, type Activation, type OnboardingStep } from "@/lib/onboarding";
import type { Capability } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { WorkspaceContext } from "@/lib/workspace";
import { dismissOnboarding } from "../_lib/onboarding-actions";
import { InlineForm } from "./client";

/** Who to ask when the viewer can't do a step themselves. */
const WHO_CAN: Partial<Record<Capability, string>> = {
  "initiative:write": "Editors and admins can do this",
  "impact:write": "Editors and admins can do this",
  "members:manage": "Ask a workspace admin",
  "settings:manage": "Ask a workspace admin",
  "billing:manage": "Ask a workspace admin to upgrade",
};

/**
 * Top-of-dashboard onboarding: the setup checklist while incomplete (or a short celebration when just
 * finished), plus a Guided Launch offer for stalled self-serve workspaces.
 */
export function OnboardingPanel({ ctx, activation }: { ctx: WorkspaceContext; activation: Activation }) {
  const mode = checklistMode(activation);
  // North Labs staff viewing a client workspace don't need to be offered North Labs.
  const offerGuidedLaunch = activation.stalled && !activation.dismissed && ctx.access.via === "membership";
  if (mode === "hidden" && !offerGuidedLaunch) return null;
  const canDismiss = ctx.can("settings:manage");

  return (
    <div className="mb-6 space-y-4">
      {mode === "checklist" ? <Checklist ctx={ctx} activation={activation} canDismiss={canDismiss} /> : null}
      {mode === "celebrate" ? <Celebration slug={ctx.org.slug} activation={activation} canDismiss={canDismiss} /> : null}
      {offerGuidedLaunch ? <GuidedLaunchCard slug={ctx.org.slug} /> : null}
    </div>
  );
}

function DismissForm({ slug, label, message }: { slug: string; label: string; message: string }) {
  return (
    <InlineForm action={dismissOnboarding}>
      <input type="hidden" name="slug" value={slug} />
      <ConfirmSubmit message={message} className="text-slate-500">
        {label}
      </ConfirmSubmit>
    </InlineForm>
  );
}

function Checklist({ ctx, activation, canDismiss }: { ctx: WorkspaceContext; activation: Activation; canDismiss: boolean }) {
  const { steps, coreDone, coreTotal, percent } = activation;
  return (
    <Card className="overflow-hidden" aria-labelledby="onboarding-title">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h2 id="onboarding-title" className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Rocket className="size-4 text-radar-600" aria-hidden /> Set up your AI portfolio
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">The first-week setup a {BRAND_COMPANY} consultant would do with you. Each step takes a few minutes.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="w-full sm:w-48">
            <div className="flex items-baseline justify-between text-xs text-slate-500">
              <span>
                <span className="font-semibold tabular-nums text-slate-900">{coreDone}</span> of {coreTotal} done
              </span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div
              className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="Setup progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div className="h-full rounded-full bg-radar-500 transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          </div>
          {canDismiss ? (
            <DismissForm slug={ctx.org.slug} label="Dismiss" message="Hide the setup checklist for everyone in this workspace?" />
          ) : null}
        </div>
      </div>
      <ol className="grid gap-px border-t border-slate-100 bg-slate-100 md:grid-cols-2">
        {steps.map((step) => (
          <StepItem key={step.id} step={step} ctx={ctx} />
        ))}
        {steps.length % 2 === 1 ? <li className="hidden bg-white md:block" aria-hidden /> : null}
      </ol>
    </Card>
  );
}

function StepItem({ step, ctx }: { step: OnboardingStep; ctx: WorkspaceContext }) {
  const can = ctx.can(step.capability);
  const secondary = step.secondary && ctx.can(step.secondary.capability) ? step.secondary : null;
  return (
    <li className="flex items-start gap-3 bg-white px-5 py-3">
      {step.done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-radar-600" aria-label="Done" />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" aria-label="To do" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-sm font-medium", step.done ? "text-slate-500 line-through decoration-slate-300" : "text-slate-900")}>{step.title}</span>
          {step.progress && !step.done ? (
            <span className="text-xs tabular-nums text-slate-500">
              {step.progress.current}/{step.progress.target}
            </span>
          ) : null}
          {step.optional ? <Badge>Optional</Badge> : null}
          {step.requiresPlan && !step.done ? <Badge tone="violet">{step.requiresPlan}</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{step.why}</p>
        {step.done ? null : step.waitingFor ? (
          <p className="mt-1.5 text-xs text-slate-400">Unlocks after {step.waitingFor}</p>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {can ? (
              <Link href={step.href} className="inline-flex items-center gap-1 font-medium text-radar-700 hover:underline">
                {step.cta} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
            {secondary ? (
              <Link href={secondary.href} className="inline-flex items-center gap-1 font-medium text-radar-700 hover:underline">
                {secondary.cta} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
            {!can && !secondary ? <span className="text-xs text-slate-400">{WHO_CAN[step.capability] ?? "Ask a workspace admin"}</span> : null}
          </div>
        )}
      </div>
    </li>
  );
}

function Celebration({ slug, activation, canDismiss }: { slug: string; activation: Activation; canDismiss: boolean }) {
  return (
    <Card className="flex flex-col gap-3 border-radar-200 bg-radar-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <PartyPopper className="mt-0.5 size-5 shrink-0 text-radar-700" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-radar-900">Your AI portfolio is set up</h2>
          <p className="mt-0.5 text-sm text-radar-900/80">
            All {activation.coreTotal} setup steps are done. From here, keep stages current and record actuals each month so the dashboard shows the value
            you&apos;re really delivering.
          </p>
        </div>
      </div>
      {canDismiss ? <DismissForm slug={slug} label="Hide" message="Hide this message for everyone in this workspace?" /> : null}
    </Card>
  );
}

function GuidedLaunchCard({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-ink-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-radar-400">Guided Launch</div>
        <h2 className="mt-1 font-semibold">Want {BRAND_COMPANY} to set this up for you?</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
          In a working session with your team, a {BRAND_COMPANY} consultant loads your initiatives, maps the data they depend on, estimates value and
          classifies risk, so the portfolio is ready to run.
        </p>
      </div>
      <ButtonLink href={`/contact?from=onboarding_stalled&workspace=${encodeURIComponent(slug)}`} variant="accent" className="shrink-0">
        Talk to {BRAND_COMPANY}
      </ButtonLink>
    </div>
  );
}
