"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/forms";
import { addTemplate } from "./actions";

export function AddTemplateButton({ slug, templateId, canUpgrade }: { slug: string; templateId: string; canUpgrade: boolean }) {
  const [state, formAction] = useActionState(addTemplate, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="templateId" value={templateId} />
      <SubmitButton size="sm" pendingText="Adding…">
        <Plus className="size-4" /> Add to portfolio
      </SubmitButton>
      {state?.error ? (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {state.error}{" "}
          {state.upgrade ? (
            canUpgrade ? (
              <Link href={`/w/${slug}/billing`} className="font-medium underline hover:text-red-900">
                See plans
              </Link>
            ) : (
              "Ask a workspace admin to upgrade."
            )
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
