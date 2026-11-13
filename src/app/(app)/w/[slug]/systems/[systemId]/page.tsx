import { and, asc, eq } from "drizzle-orm";
import { ChevronLeft, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from "@/components/ui";
import { db } from "@/db";
import { dataDependencies, initiatives, systems } from "@/db/schema";
import { SYSTEM_CATEGORIES, labelFrom } from "@/lib/taxonomy";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { AccessBadge, SensitivityBadge, StageBadge } from "../../_components/badges";
import { InlineForm } from "../../_components/client";
import { deleteSystem } from "../actions";
import { SystemForm } from "../system-form";

async function loadSystem(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(systems)
    .where(and(eq(systems.id, id), eq(systems.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: PageProps<"/w/[slug]/systems/[systemId]">): Promise<Metadata> {
  const { slug, systemId } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const system = await loadSystem(ctx.org.id, systemId);
  return { title: system?.name ?? "System" };
}

export default async function SystemPage({ params }: PageProps<"/w/[slug]/systems/[systemId]">) {
  const { slug, systemId } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const system = await loadSystem(ctx.org.id, systemId);
  if (!system) notFound();
  const base = `/w/${ctx.org.slug}`;

  const deps = await db
    .select({
      id: dataDependencies.id,
      dataDescription: dataDependencies.dataDescription,
      accessStatus: dataDependencies.accessStatus,
      sensitivity: dataDependencies.sensitivity,
      notes: dataDependencies.notes,
      initiativeId: initiatives.id,
      initiativeTitle: initiatives.title,
      initiativeStage: initiatives.stage,
      archivedAt: initiatives.archivedAt,
    })
    .from(dataDependencies)
    .innerJoin(initiatives, eq(dataDependencies.initiativeId, initiatives.id))
    .where(and(eq(dataDependencies.systemId, system.id), eq(initiatives.orgId, ctx.org.id)))
    .orderBy(asc(initiatives.title));
  const initiativeCount = new Set(deps.map((d) => d.initiativeId)).size;

  return (
    <>
      <Link href={`${base}/systems`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" /> Systems & data
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{system.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Badge>{labelFrom(SYSTEM_CATEGORIES, system.category)}</Badge>
          {system.vendor ? <span>{system.vendor}</span> : null}
          {system.owner ? <span>· Owner: {system.owner}</span> : null}
        </div>
        {system.description ? <p className="mt-3 max-w-2xl text-sm text-slate-600">{system.description}</p> : null}
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Initiatives that depend on this system" description={`${initiativeCount} initiative${initiativeCount === 1 ? "" : "s"} · ${deps.length} dataset${deps.length === 1 ? "" : "s"}`} />
        {deps.length === 0 ? (
          <CardBody>
            <EmptyState title="No initiatives depend on this system yet" description="Add a data dependency from an initiative's page." />
          </CardBody>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Initiative</Th>
                <Th>Data</Th>
                <Th>Sensitivity</Th>
                <Th>Access</Th>
              </tr>
            </thead>
            <tbody>
              {deps.map((d) => (
                <tr key={d.id}>
                  <Td className="min-w-56">
                    <Link href={`${base}/initiatives/${d.initiativeId}`} className="font-medium text-slate-900 hover:text-radar-700 hover:underline">
                      {d.initiativeTitle}
                    </Link>
                    <div className="mt-1 flex gap-1.5">
                      <StageBadge stage={d.initiativeStage} />
                      {d.archivedAt ? <Badge tone="dark">Archived</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    {d.dataDescription}
                    {d.notes ? <div className="mt-0.5 text-xs text-slate-500">{d.notes}</div> : null}
                  </Td>
                  <Td>
                    <SensitivityBadge sensitivity={d.sensitivity} />
                  </Td>
                  <Td>
                    <AccessBadge status={d.accessStatus} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {ctx.can("system:write") ? (
        <Card className="mt-6">
          <CardHeader
            title="Edit system"
            action={
              <InlineForm action={deleteSystem}>
                <input type="hidden" name="slug" value={ctx.org.slug} />
                <input type="hidden" name="id" value={system.id} />
                <ConfirmSubmit
                  message={deps.length ? `Delete ${system.name}? Its ${deps.length} data dependenc${deps.length === 1 ? "y" : "ies"} will also be removed.` : `Delete ${system.name}?`}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="size-3.5" /> Delete
                </ConfirmSubmit>
              </InlineForm>
            }
          />
          <CardBody>
            <SystemForm slug={ctx.org.slug} system={system} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
