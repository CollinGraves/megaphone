import { Field, Input, Select, Textarea } from "@/components/ui";
import { IDEA_FREQUENCIES } from "@/lib/ideas";
import { IDEA_URGENCY } from "@/lib/taxonomy";

const URGENCY_HINTS: Record<string, string> = {
  low: "Would be nice someday",
  medium: "Real pain, worth doing this year",
  high: "Costing us now — customers, revenue or risk",
};

/**
 * The idea questions, shared by the in-app form and the public intake link. Written for employees,
 * not the AI team: plain questions, examples, and "a rough guess is fine".
 */
export function IdeaFields({ departments = [] }: { departments?: string[] }) {
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <Field label="Your idea in one line" htmlFor="idea-title">
          <Input id="idea-title" name="title" required minLength={3} maxLength={160} placeholder="e.g. Draft first replies to warranty claim emails" />
        </Field>
        <Field
          label="What problem would it solve?"
          htmlFor="idea-problem"
          hint="What happens today, who does it, and what makes it slow, error-prone or costly."
        >
          <Textarea
            id="idea-problem"
            name="problem"
            required
            minLength={10}
            maxLength={5000}
            rows={4}
            placeholder="e.g. Our 6-person claims team reads every warranty email, looks up the order in SAP and types a reply. Most are the same five questions."
          />
        </Field>
        <Field label="What would good look like?" htmlFor="idea-outcome" hint="Optional. The outcome you'd hope for — not the technology.">
          <Textarea id="idea-outcome" name="desiredOutcome" maxLength={2000} rows={2} className="min-h-16" placeholder="e.g. Replies drafted in seconds; the team just checks and sends." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Department or team" htmlFor="idea-department">
            <Input id="idea-department" name="department" maxLength={100} list={departments.length ? "idea-departments" : undefined} placeholder="e.g. Customer Service" />
            {departments.length ? (
              <datalist id="idea-departments">
                {departments.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            ) : null}
          </Field>
          <Field label="Systems or data involved" htmlFor="idea-systems" hint="Optional, e.g. Salesforce, SAP, shared drive.">
            <Input id="idea-systems" name="systemsInvolved" maxLength={300} />
          </Field>
        </div>
      </section>

      <section className="space-y-4 border-t border-slate-100 pt-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">How big is it?</h3>
          <p className="mt-0.5 text-xs text-slate-500">A rough guess is fine — it helps the AI team see where the hours are.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="How often does it happen?" htmlFor="idea-frequency">
            <Select id="idea-frequency" name="frequency" defaultValue="">
              <option value="">Not sure</option>
              {IDEA_FREQUENCIES.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How many people do this?" htmlFor="idea-people" hint="Including you.">
            <Input id="idea-people" name="peopleAffected" type="number" inputMode="numeric" min={1} max={1000000} step={1} placeholder="e.g. 6" />
          </Field>
          <Field label="Hours per week, per person" htmlFor="idea-hours" hint="Time spent on it today.">
            <Input id="idea-hours" name="hoursPerWeek" type="number" inputMode="decimal" min={0} max={168} step="any" placeholder="e.g. 4" />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">How urgent is it?</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
            {IDEA_URGENCY.map((u) => (
              <label key={u.slug} className="cursor-pointer">
                <input type="radio" name="urgency" value={u.slug} defaultChecked={u.slug === "medium"} className="peer sr-only" />
                <span className="block h-full rounded-lg border border-slate-300 bg-white px-3 py-2 transition-colors peer-checked:border-radar-600 peer-checked:bg-radar-50 peer-focus-visible:ring-2 peer-focus-visible:ring-radar-500 hover:border-slate-400">
                  <span className="block text-sm font-medium text-slate-900">{u.label}</span>
                  <span className="block text-xs text-slate-500">{URGENCY_HINTS[u.slug]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
