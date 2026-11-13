import { Database, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { SYSTEM_CATEGORIES, labelFrom } from "@/lib/taxonomy";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { loadOrgDependencies, systemUsage } from "../_lib/dependencies";
import { listSystems } from "../_lib/queries";
import { SystemForm } from "./system-form";

export const metadata: Metadata = { title: "Systems & data" };

export default async function SystemsPage({ params }: PageProps<"/w/[slug]/systems">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;
  const [rows, deps] = await Promise.all([listSystems(ctx.org.id), loadOrgDependencies(ctx.org.id)]);
  const usage = systemUsage(deps);
  const sorted = [...rows].sort((a, b) => (usage.get(b.id)?.initiativeCount ?? 0) - (usage.get(a.id)?.initiativeCount ?? 0) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        eyebrow="Data readiness"
        title="Systems & data"
        description="The systems of record your AI initiatives depend on. Track which initiatives need which data, and where access is blocked."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Database className="size-8" />}
          title="No systems yet"
          description="Add the systems of record your initiatives rely on — CRM, ERP, data warehouse, document stores."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>System</Th>
                <Th>Category</Th>
                <Th>Owner</Th>
                <Th className="text-right">Initiatives</Th>
                <Th>Access</Th>
                <Th className="text-right">Sensitive datasets</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const u = usage.get(s.id);
                return (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <Td>
                      <Link href={`${base}/systems/${s.id}`} className="font-medium text-slate-900 hover:text-radar-700 hover:underline">
                        {s.name}
                      </Link>
                      {s.vendor ? <div className="text-xs text-slate-500">{s.vendor}</div> : null}
                    </Td>
                    <Td className="whitespace-nowrap">{labelFrom(SYSTEM_CATEGORIES, s.category)}</Td>
                    <Td>{s.owner ?? <span className="text-slate-400">—</span>}</Td>
                    <Td className="text-right font-semibold tabular-nums text-slate-900">{u?.initiativeCount ?? 0}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      {u?.blocked ? <span className="mr-2 font-medium text-red-700">{u.blocked} blocked</span> : null}
                      {u?.requested ? <span className="font-medium text-amber-700">{u.requested} pending</span> : null}
                      {!u?.blocked && !u?.requested ? <span className="text-slate-400">{u ? "No issues" : "—"}</span> : null}
                    </Td>
                    <Td className="text-right tabular-nums">{u?.sensitive ? <span className="font-medium text-violet-700">{u.sensitive}</span> : <span className="text-slate-400">0</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {ctx.can("system:write") ? (
        <Card className="mt-6">
          <CardHeader title={<span className="inline-flex items-center gap-1.5"><Plus className="size-4" /> Add a system</span>} />
          <CardBody>
            <SystemForm slug={ctx.org.slug} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
