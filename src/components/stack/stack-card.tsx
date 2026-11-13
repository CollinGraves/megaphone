import { Check, Layers3, X } from "lucide-react";
import { addStackItemAction, confirmStackItem, rejectStackItem } from "@/app/(app)/feed/actions";
import type { StackContext } from "@/lib/graph/personalize";
import { ActionForm, SubmitButton } from "../forms";
import { Card, Input } from "../ui";

const SOURCE_LABEL = {
  enrichment: "from company data",
  workspace: "from your workspace",
  colleagues: "inferred",
  user: "added by your team",
} as const;

/** The company's inferred stack, which anyone at the company can confirm or correct. */
export function StackCard({ ctx }: { ctx: StackContext }) {
  const unreviewed = ctx.items.filter((i) => i.status === "inferred").length;
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Layers3 className="size-4 text-radar-600" /> {ctx.companyName}&apos;s stack
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {ctx.items.length
          ? unreviewed
            ? "We tailor your radar to the tools your company runs on. Is this right?"
            : "Your radar is tuned to these tools."
          : `Tell us what ${ctx.companyName} runs on and we'll flag news and deadlines that affect it.`}
      </p>
      {ctx.items.length ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {ctx.items.map((i) => (
            <li key={i.entity.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{i.entity.name}</div>
                <div className="text-xs text-slate-500">{i.status === "confirmed" ? "Confirmed" : SOURCE_LABEL[i.source]}</div>
              </div>
              {i.status !== "confirmed" ? (
                <form action={confirmStackItem}>
                  <input type="hidden" name="entityId" value={i.entity.id} />
                  <button type="submit" className="rounded-md p-1.5 text-slate-400 hover:bg-radar-50 hover:text-radar-700" aria-label={`Confirm ${i.entity.name}`}>
                    <Check className="size-4" />
                  </button>
                </form>
              ) : null}
              <form action={rejectStackItem}>
                <input type="hidden" name="entityId" value={i.entity.id} />
                <button type="submit" className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${i.entity.name}`}>
                  <X className="size-4" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <ActionForm action={addStackItemAction} className="mt-3 space-y-2" resetOnSuccess>
        <div className="flex gap-2">
          <Input name="name" placeholder="Add a tool, e.g. Salesforce" className="h-9 text-sm" required minLength={2} maxLength={80} />
          <SubmitButton variant="secondary" size="sm" pendingText="…">
            Add
          </SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
