import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, count, eq, isNull } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { departmentOptions } from "@/lib/departments.server";
import { hasAnthropic } from "@/lib/env";
import { initiativeLimit } from "@/lib/plans";
import { VENDORS } from "@/lib/taxonomy";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Import a list" };
// Reading a long list with AI can take a little while.
export const maxDuration = 120;

export default async function ImportPage({ params }: PageProps<"/w/[slug]/initiatives/import">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  if (!ctx.can("initiative:write")) notFound();
  const cap = initiativeLimit(ctx.org.plan);
  const [[{ n }], departments] = await Promise.all([
    db
      .select({ n: count() })
      .from(initiatives)
      .where(and(eq(initiatives.orgId, ctx.org.id), isNull(initiatives.archivedAt))),
    departmentOptions(ctx.org),
  ]);
  const room = cap == null ? null : Math.max(0, cap - n);

  return (
    <div className="max-w-4xl">
      <Link href={`/w/${ctx.org.slug}/initiatives`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="size-4" /> AI projects
      </Link>
      <PageHeader
        eyebrow="AI projects"
        title="Import a list"
        description="Already have your AI projects in a spreadsheet, a doc or your notes? Paste them here. You check everything before it's added."
      />
      <ImportClient
        slug={ctx.org.slug}
        room={room}
        aiEnabled={hasAnthropic()}
        departments={departments}
        vendorLabels={Object.fromEntries(VENDORS.map((v) => [v.slug, v.label]))}
      />
    </div>
  );
}
