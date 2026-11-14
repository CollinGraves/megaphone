import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { departmentOptions } from "@/lib/departments.server";
import { listBusinessUnits } from "../../_lib/queries";
import { InitiativeForm } from "../initiative-form";

export const metadata: Metadata = { title: "New initiative" };

export default async function NewInitiativePage({ params, searchParams }: PageProps<"/w/[slug]/initiatives/new">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  if (!ctx.can("initiative:write")) notFound();
  const [businessUnits, departments] = await Promise.all([listBusinessUnits(ctx.org.id), departmentOptions(ctx.org)]);
  const preset = typeof sp.department === "string" ? departments.find((d) => d.id === sp.department)?.id ?? null : null;
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Initiatives" title="New initiative" description="Capture the problem, ownership, platforms and how it should be prioritized. You can add impact metrics and data dependencies next." />
      <InitiativeForm
        slug={ctx.org.slug}
        businessUnits={businessUnits}
        weights={ctx.org.scoringWeights}
        cancelHref={`/w/${ctx.org.slug}/initiatives`}
        departments={departments}
        defaultDepartmentId={preset}
      />
    </div>
  );
}
