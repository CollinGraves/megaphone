"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import {
  AI_TOOLS,
  BUSINESS_FUNCTIONS,
  DIMENSIONS,
  MAX_FUNCTIONS,
  QUESTIONS,
  ROLES,
  questionsFor,
  type DimensionId,
  type Question,
} from "@/lib/assessment";
import { COMPANY_SIZES, INDUSTRIES } from "@/lib/taxonomy";
import { Alert, Button, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import { submitAssessment, trackAssessmentStarted } from "../actions";

type Context = { industry: string; companySize: string; role: string; functions: string[]; tools: string[] };
type Draft = { step: number; context: Context; answers: Record<string, number>; started: boolean };

const STORAGE_KEY = "ai-radar:assessment-draft:v1";
const STEPS = [{ id: "context" as const, label: "Your company", short: "Company" }, ...DIMENSIONS.map((d) => ({ id: d.id, label: d.label, short: d.short }))];
const EMPTY: Draft = { step: 0, context: { industry: "", companySize: "", role: "", functions: [], tools: [] }, answers: {}, started: false };

function loadDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (typeof d?.step !== "number" || typeof d.answers !== "object" || typeof d.context !== "object") return null;
    return { ...EMPTY, ...d, step: Math.min(Math.max(0, d.step), STEPS.length - 1), context: { ...EMPTY.context, ...d.context } };
  } catch {
    return null;
  }
}

function saveDraft(d: Draft | null) {
  try {
    if (d) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the questionnaire still works without it.
  }
}

/** Missing fields on a step, as DOM ids of the first control to focus. */
function missingOn(step: number, d: Draft): string[] {
  if (step === 0) {
    const c = d.context;
    return [
      !c.industry && "ctx-industry",
      !c.companySize && "ctx-companySize",
      !c.role && "ctx-role",
      c.functions.length === 0 && "ctx-functions",
    ].filter(Boolean) as string[];
  }
  return questionsFor(STEPS[step].id as DimensionId)
    .filter((q) => d.answers[q.id] === undefined)
    .map((q) => `q-${q.id}`);
}

export function Questionnaire({ source }: { source?: string }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Restore an in-progress draft (e.g. after a refresh). Runs after hydration to avoid a mismatch.
  useEffect(() => {
    const saved = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from sessionStorage
    if (saved) setDraft(saved);
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveDraft(draft);
  }, [draft, restored]);

  // Move focus to the step heading on step change (not on first load) for keyboard and screen-reader users.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [draft.step]);

  const step = draft.step;
  const isLast = step === STEPS.length - 1;
  const missing = missingOn(step, draft);
  const answered = Object.keys(draft.answers).filter((k) => QUESTIONS.some((q) => q.id === k)).length;

  const setContext = (patch: Partial<Context>) => setDraft((d) => ({ ...d, context: { ...d.context, ...patch } }));
  const answer = (qid: string, idx: number) => setDraft((d) => ({ ...d, answers: { ...d.answers, [qid]: idx } }));

  function go(to: number) {
    setShowErrors(false);
    setError(null);
    setDraft((d) => ({ ...d, step: to }));
  }

  function onNext(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) {
      setShowErrors(true);
      const el = document.getElementById(missing[0]);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el?.querySelector("input,select") as HTMLElement | null)?.focus({ preventScroll: true });
      return;
    }
    if (step === 0 && !draft.started) {
      setDraft((d) => ({ ...d, started: true }));
      void trackAssessmentStarted(source);
    }
    if (!isLast) return go(step + 1);

    setError(null);
    startTransition(async () => {
      const payload = { context: draft.context, answers: draft.answers, source };
      saveDraft(null);
      try {
        const res = await submitAssessment(payload);
        if (res?.error) {
          saveDraft(draft);
          setError(res.error);
        }
      } catch (err) {
        // A successful submission redirects (handled by Next); anything else is a real failure.
        if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw err;
        saveDraft(draft);
        setError("Something went wrong saving your answers. Please try again.");
      }
    });
  }

  const current = STEPS[step];
  const dimension = DIMENSIONS.find((d) => d.id === current.id);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-10">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="font-medium text-slate-900">
            Step {step + 1} of {STEPS.length}
            <span className="font-normal text-slate-500"> · {current.label}</span>
          </span>
          <span className="text-xs text-slate-500 tabular-nums">
            {answered}/{QUESTIONS.length} answered
          </span>
        </div>
        <ol className="mt-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }}>
          {STEPS.map((s, i) => (
            <li key={s.id} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">
                {s.label}
                {i < step ? " (completed)" : ""}
              </span>
              <div className={cn("h-1.5 rounded-full", i < step ? "bg-radar-500" : i === step ? "bg-ink-900" : "bg-slate-200")} aria-hidden />
              <div className={cn("mt-1.5 hidden truncate text-[11px] md:block", i === step ? "font-medium text-slate-900" : "text-slate-400")} aria-hidden>
                {s.short}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <form onSubmit={onNext} noValidate>
        <div className="scroll-mt-24">
          <div className="text-xs font-semibold uppercase tracking-wide text-radar-700">
            {step === 0 ? "About your company" : `Dimension ${step} of ${DIMENSIONS.length}`}
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 scroll-mt-24 text-2xl font-semibold tracking-tight text-slate-900 outline-none sm:text-3xl">
            {current.label}
          </h1>
          <p className="mt-2 text-slate-600">
            {dimension?.description ?? "A little context so we can tailor your recommendations and starter initiatives."}
          </p>
        </div>

        <div className="mt-8 space-y-8">
          {step === 0 ? (
            <ContextStep context={draft.context} setContext={setContext} showErrors={showErrors} />
          ) : (
            questionsFor(current.id as DimensionId).map((q) => (
              <QuestionField
                key={q.id}
                question={q}
                number={QUESTIONS.indexOf(q) + 1}
                value={draft.answers[q.id]}
                onChange={(i) => answer(q.id, i)}
                invalid={showErrors && draft.answers[q.id] === undefined}
              />
            ))
          )}
        </div>

        {error ? (
          <Alert tone="error" className="mt-6">
            {error}
          </Alert>
        ) : null}

        <div className="sticky bottom-0 z-10 -mx-4 mt-10 border-t border-slate-200 bg-[#f7f8fa]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button type="button" variant="secondary" size="lg" onClick={() => go(step - 1)} disabled={pending}>
                <ArrowLeft className="size-4" aria-hidden /> Back
              </Button>
            ) : (
              <span className="hidden text-sm text-slate-500 sm:block">About 5 minutes · {QUESTIONS.length} questions</span>
            )}
            <Button type="submit" size="lg" variant={isLast ? "accent" : "primary"} disabled={pending} className="ml-auto">
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Scoring…
                </>
              ) : isLast ? (
                <>
                  See my results <ArrowRight className="size-4" aria-hidden />
                </>
              ) : (
                <>
                  Next <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </Button>
          </div>
          {showErrors && missing.length ? (
            <p className="mt-2 text-right text-sm text-red-700" role="alert">
              {step === 0 ? "Please complete the highlighted fields." : `Please answer ${missing.length === 1 ? "the remaining question" : `all ${missing.length} remaining questions`}.`}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────────── Steps ───────────────────────────── */

function QuestionField({
  question,
  number,
  value,
  onChange,
  invalid,
}: {
  question: Question;
  number: number;
  value: number | undefined;
  onChange: (idx: number) => void;
  invalid: boolean;
}) {
  return (
    <fieldset id={`q-${question.id}`} className="scroll-mt-24" aria-invalid={invalid || undefined}>
      <legend className="text-base font-semibold text-slate-900">
        <span className="mr-1.5 text-slate-400 tabular-nums">{number}.</span>
        {question.prompt}
      </legend>
      {invalid ? <p className="mt-1 text-sm text-red-700">Please choose an answer.</p> : null}
      <div className="mt-3 grid gap-2">
        {question.options.map((o, i) => (
          <OptionCard key={i} name={question.id} checked={value === i} onChange={() => onChange(i)} invalid={invalid}>
            {o.label}
          </OptionCard>
        ))}
      </div>
    </fieldset>
  );
}

function OptionCard({
  name,
  checked,
  onChange,
  invalid,
  type = "radio",
  disabled,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  invalid?: boolean;
  type?: "radio" | "checkbox";
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={cn("group relative block", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <input type={type} name={name} checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
      <span
        className={cn(
          "flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm text-slate-700 transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-radar-500 peer-focus-visible:ring-offset-1",
          checked ? "border-radar-600 bg-radar-50 text-slate-900 ring-1 ring-radar-600" : invalid ? "border-red-300" : "border-slate-200 group-hover:border-slate-300",
        )}
      >
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center border transition-colors",
            type === "radio" ? "rounded-full" : "rounded-md",
            checked ? "border-radar-600 bg-radar-600 text-white" : "border-slate-300 bg-white",
          )}
          aria-hidden
        >
          {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
        <span className="leading-snug">{children}</span>
      </span>
    </label>
  );
}

function Chip({
  name,
  checked,
  onChange,
  disabled,
  type = "checkbox",
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  type?: "checkbox" | "radio";
  children: ReactNode;
}) {
  return (
    <label className={cn(disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <input type={type} name={name} checked={checked} onChange={onChange} disabled={disabled} className="peer sr-only" />
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-radar-500",
          checked ? "border-radar-600 bg-radar-50 text-radar-900" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400",
        )}
      >
        {checked ? <Check className="size-3.5" aria-hidden /> : null}
        {children}
      </span>
    </label>
  );
}

function Group({ id, label, hint, invalid, children }: { id: string; label: string; hint?: string; invalid?: boolean; children: ReactNode }) {
  return (
    <fieldset id={id} className="scroll-mt-24">
      <legend className="text-base font-semibold text-slate-900">{label}</legend>
      {hint ? <p className="mt-0.5 text-sm text-slate-500">{hint}</p> : null}
      {invalid ? <p className="mt-1 text-sm text-red-700">This is required.</p> : null}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function ContextStep({ context: c, setContext, showErrors }: { context: Context; setContext: (p: Partial<Context>) => void; showErrors: boolean }) {
  const toggle = (list: string[], slug: string) => (list.includes(slug) ? list.filter((x) => x !== slug) : [...list, slug]);
  return (
    <>
      <div id="ctx-industry" className="scroll-mt-24">
        <label htmlFor="ctx-industry-select" className="text-base font-semibold text-slate-900">
          Industry
        </label>
        {showErrors && !c.industry ? <p className="mt-1 text-sm text-red-700">This is required.</p> : null}
        <Select
          id="ctx-industry-select"
          value={c.industry}
          onChange={(e) => setContext({ industry: e.target.value })}
          className={cn("mt-3 h-11 max-w-md", showErrors && !c.industry && "border-red-300")}
        >
          <option value="" disabled>
            Choose your industry…
          </option>
          {INDUSTRIES.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.label}
            </option>
          ))}
        </Select>
      </div>

      <Group id="ctx-companySize" label="Company size" hint="Number of employees" invalid={showErrors && !c.companySize}>
        <div className="flex flex-wrap gap-2">
          {COMPANY_SIZES.map((s) => (
            <Chip key={s} type="radio" name="companySize" checked={c.companySize === s} onChange={() => setContext({ companySize: s })}>
              {s}
            </Chip>
          ))}
        </div>
      </Group>

      <Group id="ctx-role" label="Your role" invalid={showErrors && !c.role}>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <OptionCard key={r.slug} name="role" checked={c.role === r.slug} onChange={() => setContext({ role: r.slug })} invalid={showErrors && !c.role}>
              {r.label}
            </OptionCard>
          ))}
        </div>
      </Group>

      <Group
        id="ctx-functions"
        label="Where would AI help most?"
        hint={`Choose up to ${MAX_FUNCTIONS} business functions, most important first.`}
        invalid={showErrors && c.functions.length === 0}
      >
        <div className="flex flex-wrap gap-2">
          {BUSINESS_FUNCTIONS.map((f) => {
            const checked = c.functions.includes(f.slug);
            return (
              <Chip
                key={f.slug}
                name="functions"
                checked={checked}
                disabled={!checked && c.functions.length >= MAX_FUNCTIONS}
                onChange={() => setContext({ functions: toggle(c.functions, f.slug) })}
              >
                {f.label}
              </Chip>
            );
          })}
        </div>
      </Group>

      <Group id="ctx-tools" label="AI tools already in use" hint="Optional. Select any your company uses today, officially or not.">
        <div className="flex flex-wrap gap-2">
          {AI_TOOLS.map((t) => (
            <Chip key={t.slug} name="tools" checked={c.tools.includes(t.slug)} onChange={() => setContext({ tools: toggle(c.tools, t.slug) })}>
              {t.label}
            </Chip>
          ))}
        </div>
      </Group>
    </>
  );
}
