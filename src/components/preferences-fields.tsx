import { ChipGroup } from "./forms";
import { Field, Input, Select } from "./ui";
import { CATEGORIES, COMPANY_SIZES, INDUSTRIES, VENDORS } from "@/lib/taxonomy";

type Defaults = {
  name?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  companySize?: string | null;
  categories?: string[];
  vendors?: string[];
  industries?: string[];
  minImportance?: number;
  digestFrequency?: string;
};

export function ProfileFields({ d }: { d: Defaults }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="name">
        <Input id="name" name="name" defaultValue={d.name ?? ""} required />
      </Field>
      <Field label="Company" htmlFor="company">
        <Input id="company" name="company" defaultValue={d.company ?? ""} required />
      </Field>
      <Field label="Job title" htmlFor="jobTitle">
        <Input id="jobTitle" name="jobTitle" defaultValue={d.jobTitle ?? ""} placeholder="e.g. VP of Operations" required />
      </Field>
      <Field label="Industry" htmlFor="industry">
        <Select id="industry" name="industry" defaultValue={d.industry ?? ""} required>
          <option value="" disabled>
            Choose…
          </option>
          {INDUSTRIES.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Company size" htmlFor="companySize" className="sm:col-span-2">
        <Select id="companySize" name="companySize" defaultValue={d.companySize ?? ""} required>
          <option value="" disabled>
            Choose…
          </option>
          {COMPANY_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} employees
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function InterestFields({ d }: { d: Defaults }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-slate-900">Topics</h3>
        <p className="mb-3 text-xs text-slate-500">What kinds of updates do you want?</p>
        <ChipGroup name="categories" options={CATEGORIES} defaultValue={d.categories} />
      </div>
      <div>
        <h3 className="text-sm font-medium text-slate-900">Companies &amp; platforms</h3>
        <p className="mb-3 text-xs text-slate-500">Vendors you use or are evaluating. Every significant update from them will reach you.</p>
        <ChipGroup name="vendors" options={VENDORS} defaultValue={d.vendors} />
      </div>
      <div>
        <h3 className="text-sm font-medium text-slate-900">Industries</h3>
        <p className="mb-3 text-xs text-slate-500">Get AI news specific to these industries.</p>
        <ChipGroup name="industries" options={INDUSTRIES} defaultValue={d.industries} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Signal threshold" htmlFor="minImportance" hint="Higher = fewer, bigger stories.">
          <Select id="minImportance" name="minImportance" defaultValue={String(d.minImportance ?? 2)}>
            <option value="1">Everything</option>
            <option value="2">Most stories (recommended)</option>
            <option value="3">Notable and above</option>
            <option value="4">Only significant news</option>
            <option value="5">Only major events</option>
          </Select>
        </Field>
        <Field label="Email digest" htmlFor="digestFrequency">
          <Select id="digestFrequency" name="digestFrequency" defaultValue={d.digestFrequency ?? "weekly"}>
            <option value="daily">Daily (weekday mornings)</option>
            <option value="weekly">Weekly (Monday mornings)</option>
            <option value="off">No email, I&apos;ll check the feed</option>
          </Select>
        </Field>
      </div>
    </div>
  );
}
