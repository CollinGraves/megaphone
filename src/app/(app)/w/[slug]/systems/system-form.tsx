import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { System } from "@/db/schema";
import { SYSTEM_CATEGORIES } from "@/lib/taxonomy";
import { createSystem, updateSystem } from "./actions";

export function SystemForm({ slug, system }: { slug: string; system?: System }) {
  const p = system ? `sys-${system.id}` : "sys-new";
  return (
    <ActionForm action={system ? updateSystem : createSystem} className="space-y-3" resetOnSuccess={!system}>
      <input type="hidden" name="slug" value={slug} />
      {system ? <input type="hidden" name="id" value={system.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor={`${p}-name`}>
          <Input id={`${p}-name`} name="name" required minLength={2} maxLength={120} defaultValue={system?.name} placeholder="e.g. Salesforce" />
        </Field>
        <Field label="Category" htmlFor={`${p}-category`}>
          <Select id={`${p}-category`} name="category" defaultValue={system?.category ?? "other"}>
            {SYSTEM_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor" htmlFor={`${p}-vendor`}>
          <Input id={`${p}-vendor`} name="vendor" maxLength={120} defaultValue={system?.vendor ?? ""} placeholder="e.g. Salesforce, SAP, in-house" />
        </Field>
        <Field label="Business / IT owner" htmlFor={`${p}-owner`}>
          <Input id={`${p}-owner`} name="owner" maxLength={120} defaultValue={system?.owner ?? ""} placeholder="Team that approves access" />
        </Field>
      </div>
      <Field label="Description" htmlFor={`${p}-description`}>
        <Textarea id={`${p}-description`} name="description" rows={2} maxLength={2000} defaultValue={system?.description ?? ""} className="min-h-16" />
      </Field>
      <SubmitButton size="sm" variant={system ? "primary" : "secondary"}>
        {system ? "Save system" : "Add system"}
      </SubmitButton>
    </ActionForm>
  );
}
