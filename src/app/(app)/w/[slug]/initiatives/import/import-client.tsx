"use client";

import { startTransition, useActionState, useState } from "react";
import { ArrowLeft, Clock, Loader2, Sparkles } from "lucide-react";
import { Alert, Button, Card, CardBody, Input, Select, Textarea } from "@/components/ui";
import type { ProposedItem } from "@/lib/import/server";
import { STAGES } from "@/lib/taxonomy";
import { createImportAction, proposeImportAction } from "./actions";

const EXAMPLE = `Project, Team, Notes, Status
Invoice exception triage, Finance, AP spends about 10 hours a week sorting exceptions. Trying ChatGPT., Pilot
Sales call summaries, Sales, Copilot writes notes after calls, Live
- HR policy chatbot: people ask HR the same PTO questions every day
- Demand forecasting with Gemini (just an idea)`;

type Row = ProposedItem & { include: boolean };

export function ImportClient({
  slug,
  room,
  aiEnabled,
  departments,
  vendorLabels,
}: {
  slug: string;
  /** Projects the plan still has room for (null = no limit). */
  room: number | null;
  aiEnabled: boolean;
  departments: { id: string; name: string }[];
  vendorLabels: Record<string, string>;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<{ generator?: string; fellBack?: boolean }>({});
  const [proposeState, propose, reading] = useActionState(async (prev: Awaited<ReturnType<typeof proposeImportAction>>, form: FormData) => {
    const next = await proposeImportAction(prev, form);
    if (next?.items) {
      setRows(next.items.map((i) => ({ ...i, include: !i.duplicateOf })));
      setMeta({ generator: next.generator, fellBack: next.fellBack });
    }
    return next;
  }, null);
  const [createState, create, saving] = useActionState(createImportAction, null);

  const update = (idx: number, patch: Partial<Row>) => setRows((r) => (r ? r.map((row, i) => (i === idx ? { ...row, ...patch } : row)) : r));
  const picked = rows?.filter((r) => r.include) ?? [];
  const overLimit = room != null && picked.length > room;

  if (!rows) {
    return (
      <Card>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              startTransition(() => propose(data));
            }}
            className="space-y-4"
          >
            <input type="hidden" name="slug" value={slug} />
            {proposeState?.error ? <Alert tone="error">{proposeState.error}</Alert> : null}
            <label htmlFor="import-text" className="block text-sm font-medium text-slate-900">
              Paste your list
            </label>
            <Textarea
              id="import-text"
              name="text"
              rows={12}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={20000}
              placeholder="Paste rows from a spreadsheet, meeting notes or a bullet list. One AI project per line works best."
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setText(EXAMPLE)} className="text-sm text-radar-700 hover:underline">
                Try an example
              </button>
              <Button type="submit" disabled={reading || text.trim().length < 3}>
                {reading ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Sparkles className="size-4" />}
                {reading ? (aiEnabled ? "Reading with AI…" : "Reading…") : "Read my list"}
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              {aiEnabled
                ? "AI reads your list and suggests a title, team, tools, stage and scores for each project. Nothing is saved until you check it."
                : "We'll read each line or spreadsheet row as one project. Nothing is saved until you check it."}
            </p>
          </form>
        </CardBody>
      </Card>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        data.set(
          "items",
          JSON.stringify(
            picked.map((r) => ({
              title: r.title,
              problem: r.problem,
              solution: r.solution,
              businessUnit: r.businessUnit,
              owner: r.owner,
              platforms: r.platforms,
              stage: r.stage,
              valueScore: r.valueScore,
              feasibilityScore: r.feasibilityScore,
              hoursSavedPerMonth: r.hoursSavedPerMonth,
            })),
          ),
        );
        startTransition(() => create(data));
      }}
      className="space-y-4"
    >
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setRows(null)} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" /> Edit the pasted text
        </button>
        <span className="text-sm text-slate-600">
          Found {rows.length} AI project{rows.length === 1 ? "" : "s"}
          {meta.generator && meta.generator !== "plain" ? " with AI" : ""}. Untick any you don&apos;t want.
        </span>
      </div>
      {meta.fellBack ? <Alert tone="warning">The AI reader wasn&apos;t available, so we read one project per line instead.</Alert> : null}
      {createState?.error ? <Alert tone="error">{createState.error}</Alert> : null}

      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {rows.map((r, idx) => (
            <li key={idx} className={`flex gap-3 px-4 py-3 ${r.include ? "" : "bg-slate-50 opacity-70"}`}>
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => update(idx, { include: e.target.checked })}
                aria-label={`Add ${r.title}`}
                className="mt-2.5 size-4 shrink-0 accent-radar-600"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={r.title} onChange={(e) => update(idx, { title: e.target.value })} maxLength={160} aria-label="Title" className="min-w-0 flex-1" />
                  <Select value={r.stage} onChange={(e) => update(idx, { stage: e.target.value as Row["stage"] })} aria-label="Stage" className="sm:w-36">
                    {STAGES.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {r.problem ? <p className="text-sm text-slate-600">{r.problem}</p> : null}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {r.businessUnit ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700">{r.businessUnit}</span> : null}
                  {r.owner ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700">Owner: {r.owner}</span> : null}
                  {r.platforms.map((p) => (
                    <span key={p} className="rounded-md bg-radar-50 px-1.5 py-0.5 text-radar-800">
                      {vendorLabels[p] ?? p}
                    </span>
                  ))}
                  {r.hoursSavedPerMonth ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-800">
                      <Clock className="size-3" /> ~{r.hoursSavedPerMonth.toLocaleString("en-US")} hours saved a month
                    </span>
                  ) : null}
                  {r.duplicateOf ? <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-red-700">Looks like &ldquo;{r.duplicateOf}&rdquo;, which you already have</span> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {departments.length ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Department
            <Select name="departmentId" defaultValue="" className="w-auto">
              <option value="">Company-wide</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <span />
        )}
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button type="submit" disabled={saving || picked.length === 0 || overLimit}>
            {saving ? "Adding…" : `Add ${picked.length} AI project${picked.length === 1 ? "" : "s"}`}
          </Button>
          {overLimit ? (
            <span className="text-xs text-red-700">
              Your plan has room for {room} more. Untick {picked.length - (room ?? 0)}, or upgrade in Plan &amp; billing.
            </span>
          ) : room != null ? (
            <span className="text-xs text-slate-500">Your plan has room for {room} more.</span>
          ) : null}
        </div>
      </div>
    </form>
  );
}
