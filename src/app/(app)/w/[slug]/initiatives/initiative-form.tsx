import { ActionForm, ChipGroup, SubmitButton } from "@/components/forms";
import { ButtonLink, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { SCORE_GUIDE, normalizeWeights } from "@/lib/scoring";
import { BUILD_APPROACHES, HEALTH, STAGES } from "@/lib/taxonomy";
import type { Initiative, ScoringWeights } from "@/db/schema";
import { PLATFORM_OPTIONS } from "../_components/badges";
import { saveInitiative } from "./actions";

const SCORE_KEYS = [
  ["value", "valueScore"],
  ["feasibility", "feasibilityScore"],
  ["alignment", "alignmentScore"],
  ["risk", "riskScore"],
] as const;

export function InitiativeForm({
  slug,
  initiative,
  businessUnits,
  weights,
  cancelHref,
}: {
  slug: string;
  initiative?: Initiative;
  businessUnits: string[];
  weights: ScoringWeights;
  cancelHref: string;
}) {
  const i = initiative;
  const w = normalizeWeights(weights);
  return (
    <ActionForm action={saveInitiative} className="space-y-6">
      <input type="hidden" name="slug" value={slug} />
      {i ? <input type="hidden" name="id" value={i.id} /> : null}

      <Card>
        <CardHeader title="What and why" description="The business problem comes first — it's what executives read." />
        <CardBody className="space-y-4">
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" required minLength={3} maxLength={160} defaultValue={i?.title} placeholder="e.g. Customer service email triage" />
          </Field>
          <Field label="Problem being solved" htmlFor="problemStatement" hint="Who is affected, how often, and what it costs today.">
            <Textarea id="problemStatement" name="problemStatement" rows={4} maxLength={5000} defaultValue={i?.problemStatement} />
          </Field>
          <Field label="Proposed solution" htmlFor="proposedSolution" hint="How AI will be applied, and where humans stay in the loop.">
            <Textarea id="proposedSolution" name="proposedSolution" rows={4} maxLength={5000} defaultValue={i?.proposedSolution} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Ownership & status" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Business unit" htmlFor="businessUnit">
            <Input id="businessUnit" name="businessUnit" list="business-units" maxLength={100} defaultValue={i?.businessUnit ?? ""} placeholder="e.g. Customer Service" />
            <datalist id="business-units">
              {businessUnits.map((bu) => (
                <option key={bu} value={bu} />
              ))}
            </datalist>
          </Field>
          <Field label="Executive sponsor" htmlFor="sponsor">
            <Input id="sponsor" name="sponsor" maxLength={120} defaultValue={i?.sponsor ?? ""} />
          </Field>
          <Field label="Initiative owner" htmlFor="ownerName">
            <Input id="ownerName" name="ownerName" maxLength={120} defaultValue={i?.ownerName ?? ""} />
          </Field>
          <Field label="Build approach" htmlFor="buildApproach">
            <Select id="buildApproach" name="buildApproach" defaultValue={i?.buildApproach ?? ""}>
              <option value="">Not decided</option>
              {BUILD_APPROACHES.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Stage" htmlFor="stage">
            <Select id="stage" name="stage" defaultValue={i?.stage ?? "idea"}>
              {STAGES.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Health" htmlFor="health">
            <Select id="health" name="health" defaultValue={i?.health ?? "on_track"}>
              {HEALTH.map((h) => (
                <option key={h.slug} value={h.slug}>
                  {h.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target date" htmlFor="targetDate">
            <Input id="targetDate" name="targetDate" type="date" defaultValue={i?.targetDate ?? ""} />
          </Field>
          <Field label="Launched" htmlFor="launchedAt" hint="When it went live (pilot or production).">
            <Input id="launchedAt" name="launchedAt" type="date" defaultValue={i?.launchedAt ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Platforms & models" description="Radar alerts fire when news hits a platform selected here." />
        <CardBody className="space-y-4">
          <Field label="Platforms">
            <ChipGroup name="platforms" options={PLATFORM_OPTIONS} defaultValue={i?.platforms ?? []} />
          </Field>
          <Field label="Models & products" htmlFor="models" hint="Comma-separated, e.g. Claude Opus 5.5, Copilot Studio, fine-tuned Llama.">
            <Input id="models" name="models" maxLength={1000} defaultValue={i?.models.join(", ") ?? ""} />
          </Field>
          <Field label="Tags" htmlFor="tags" hint="Comma-separated.">
            <Input id="tags" name="tags" maxLength={800} defaultValue={i?.tags.join(", ") ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Prioritization"
          description={`Score each dimension 1–5. Current weights: value ${Math.round(w.value * 100)}%, feasibility ${Math.round(w.feasibility * 100)}%, alignment ${Math.round(w.alignment * 100)}%, risk ${Math.round(w.risk * 100)}% (inverted).`}
        />
        <CardBody className="space-y-6">
          {SCORE_KEYS.map(([key, name]) => (
            <ScoreInput key={key} name={name} dimension={key} defaultValue={i?.[name] ?? 3} />
          ))}
          <Field
            label="Rank override"
            htmlFor="rankOverride"
            hint="Optional. Pin this initiative to a position in the ranking (1 = top), e.g. for a mandated project. Leave blank to rank by score."
            className="max-w-xs"
          >
            <Input id="rankOverride" name="rankOverride" type="number" min={1} max={999} step={1} defaultValue={i?.rankOverride ?? ""} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Costs" description="Used for ROI. Impact metrics (hours saved, cost saved, revenue) are added on the initiative page." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Estimated build cost (USD)" htmlFor="estimatedBuildCost" hint="One-time: implementation, partner fees, internal effort.">
            <Input id="estimatedBuildCost" name="estimatedBuildCost" type="number" min={0} step="any" defaultValue={i?.estimatedBuildCost ?? ""} placeholder="e.g. 120000" />
          </Field>
          <Field label="Estimated annual run cost (USD)" htmlFor="estimatedAnnualRunCost" hint="Licenses, API usage, hosting, support.">
            <Input id="estimatedAnnualRunCost" name="estimatedAnnualRunCost" type="number" min={0} step="any" defaultValue={i?.estimatedAnnualRunCost ?? ""} placeholder="e.g. 36000" />
          </Field>
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton>{i ? "Save changes" : "Create initiative"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

function ScoreInput({ name, dimension, defaultValue }: { name: string; dimension: keyof ScoringWeights; defaultValue: number }) {
  const guide = SCORE_GUIDE[dimension];
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800">{guide.label}</legend>
      <p className="mt-0.5 text-xs text-slate-500">{guide.question}</p>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {guide.levels.map((label, idx) => {
          const value = idx + 1;
          return (
            <label key={value} className="cursor-pointer">
              <input type="radio" name={name} value={value} defaultChecked={defaultValue === value} className="peer sr-only" required />
              <span className="flex h-full flex-col items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1.5 py-2 text-center transition-colors peer-checked:border-radar-600 peer-checked:bg-radar-50 peer-checked:ring-1 peer-checked:ring-radar-600 peer-focus-visible:ring-2 peer-focus-visible:ring-radar-500 hover:border-slate-300">
                <span className="text-sm font-semibold tabular-nums text-slate-900">{value}</span>
                <span className="text-[11px] leading-tight text-slate-500">{label}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
