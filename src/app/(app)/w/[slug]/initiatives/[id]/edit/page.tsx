import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { departmentOptions } from "@/lib/departments.server";
import { listBusinessUnits } from "../../../_lib/queries";
import { InitiativeForm } from "../../initiative-form";

export const metadata: Metadata = { title: "Edit initiative" };

export default async function EditInitiativePage({ params }: PageProps<"/w/[slug]/initiatives/[id]/edit">) {
  const { slug, id } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  if (!ctx.can("initiative:write")) notFound();
  const [[initiative], businessUnits, departments] = await Promise.all([
    db
      .select()
      .from(initiatives)
      .where(and(eq(initiatives.id, id), eq(initiatives.orgId, ctx.org.id)))
      .limit(1),
    listBusinessUnits(ctx.org.id),
    departmentOptions(ctx.org),
  ]);
  if (!initiative) notFound();
  const detailHref = `/w/${ctx.org.slug}/initiatives/${initiative.id}`;
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="Edit initiative" title={initiative.title} />
      <InitiativeForm
        slug={ctx.org.slug}
        initiative={initiative}
        businessUnits={businessUnits}
        weights={ctx.org.scoringWeights}
        cancelHref={detailHref}
        departments={departments}
      />
    </div>
  );
}
