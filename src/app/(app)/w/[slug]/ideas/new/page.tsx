import { ChevronLeft, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ButtonLink, Card, CardBody, PageHeader } from "@/components/ui";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { listBusinessUnits } from "../../_lib/queries";
import { IdeaFields } from "../_components/idea-fields";
import { submitIdea } from "../actions";

export const metadata: Metadata = { title: "Submit an idea" };

const TIPS = [
  ["Start with the problem", "A clear pain point beats a clever solution. The AI team will figure out the how."],
  ["Size it roughly", "Hours per week and how many people are affected make it easy to compare ideas."],
  ["Small is fine", "Some of the best AI wins are a 10-minute task done 50 times a week."],
] as const;

export default async function NewIdeaPage({ params }: PageProps<"/w/[slug]/ideas/new">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  if (!ctx.can("ideas:submit")) notFound();
  const base = `/w/${ctx.org.slug}`;
  const departments = await listBusinessUnits(ctx.org.id);

  return (
    <>
      <Link href={`${base}/ideas`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" /> Ideas
      </Link>
      <PageHeader
        eyebrow="Ideas"
        title="Submit an AI idea"
        description={`Have a task that eats time, or a process AI could improve? Tell ${ctx.org.name}'s AI team — they review every idea.`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardBody className="py-5">
            <ActionForm action={submitIdea} className="space-y-6">
              <input type="hidden" name="slug" value={ctx.org.slug} />
              <IdeaFields departments={departments} />
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Submitting as <span className="font-medium text-slate-700">{ctx.user.name}</span> ({ctx.user.email})
                </p>
                <div className="flex gap-2">
                  <ButtonLink href={`${base}/ideas`} variant="ghost">
                    Cancel
                  </ButtonLink>
                  <SubmitButton pendingText="Submitting…">Submit idea</SubmitButton>
                </div>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
        <aside className="min-w-0">
          <Card className="bg-slate-50/60">
            <CardBody className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Lightbulb className="size-4 text-radar-600" /> What makes a good idea
              </div>
              <ul className="space-y-3">
                {TIPS.map(([title, body]) => (
                  <li key={title} className="text-sm">
                    <div className="font-medium text-slate-800">{title}</div>
                    <div className="text-slate-600">{body}</div>
                  </li>
                ))}
              </ul>
              <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
                You’ll be able to follow your idea’s status here, and we’ll email you when the AI team makes a decision.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
