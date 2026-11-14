import { eq } from "drizzle-orm";
import { ArrowLeft, Check, CheckCircle2, LibraryBig, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, ButtonLink, Card, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { db } from "@/db";
import { initiatives } from "@/db/schema";
import { BUSINESS_FUNCTIONS } from "@/lib/assessment/questions";
import { STARTER_TEMPLATES, templateFitsIndustry, templateMatches, type Effort, type StarterTemplate } from "@/lib/assessment/templates";
import { initiativeCapMessage, initiativeLimit, planFor } from "@/lib/plans";
import { priorityScore } from "@/lib/scoring";
import { BUILD_APPROACHES, INDUSTRIES, industryLabel, labelFrom } from "@/lib/taxonomy";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { ScorePill } from "../../_components/badges";
import { AddTemplateButton } from "./add-template-button";

export const metadata: Metadata = { title: "Initiative templates" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

const COMPANY_WIDE = "cross_functional";
const GROUPS = [{ slug: COMPANY_WIDE, label: "Company-wide" }, ...BUSINESS_FUNCTIONS] as const;

const EFFORT_TONE: Record<Effort, "radar" | "blue" | "amber"> = { Low: "radar", Medium: "blue", High: "amber" };

export default async function TemplatesPage({ params, searchParams }: PageProps<"/w/[slug]/initiatives/templates">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getWorkspaceOrNotFound(slug);
  const base = `/w/${ctx.org.slug}`;
  const canWrite = ctx.can("initiative:write");

  const q = one(sp.q);
  const fn = GROUPS.some((g) => g.slug === one(sp.fn)) ? one(sp.fn) : undefined;
  // Default to the workspace's industry; "all" shows every industry's templates.
  const requestedIndustry = one(sp.industry);
  const industry =
    requestedIndustry === "all" ? null : INDUSTRIES.some((i) => i.slug === requestedIndustry) ? requestedIndustry! : (ctx.org.industry ?? null);

  const existing = await db
    .select({ id: initiatives.id, title: initiatives.title, archivedAt: initiatives.archivedAt })
    .from(initiatives)
    .where(eq(initiatives.orgId, ctx.org.id));
  const activeCount = existing.filter((i) => !i.archivedAt).length;
  // Active initiatives win over archived ones with the same title.
  const byTitle = new Map<string, (typeof existing)[number]>();
  for (const i of existing) {
    const key = i.title.trim().toLowerCase();
    const prev = byTitle.get(key);
    if (!prev || (prev.archivedAt && !i.archivedAt)) byTitle.set(key, i);
  }

  const shown = STARTER_TEMPLATES.filter((t) => (!industry || templateFitsIndustry(t, industry)) && (!fn || t.function === fn) && templateMatches(t, q));
  const groups = GROUPS.map((g) => ({ ...g, templates: shown.filter((t) => t.function === g.slug) })).filter((g) => g.templates.length > 0);
  const addedCount = STARTER_TEMPLATES.filter((t) => byTitle.get(t.title.toLowerCase())?.archivedAt === null).length;

  const limit = initiativeLimit(ctx.org.plan);
  const capped = initiativeCapMessage(ctx.org.plan, activeCount);
  const canUpgrade = ctx.can("billing:manage");
  const filtered = Boolean(q || fn || requestedIndustry);

  return (
    <>
      <PageHeader
        eyebrow="AI portfolio"
        title="Initiative templates"
        description="Common AI use cases written up the way North Labs scopes them: the problem, typical value drivers, effort and suggested scores. Add one as an idea, then adjust it to your business."
        actions={
          <>
            <ButtonLink href={`${base}/initiatives`} variant="secondary">
              <ArrowLeft className="size-4" /> Initiatives
            </ButtonLink>
            {canWrite ? (
              <ButtonLink href={`${base}/initiatives/new`} variant="secondary">
                <Plus className="size-4" /> Blank initiative
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {canWrite && capped ? (
        <Alert tone="warning" className="mb-4">
          {capped}{" "}
          {canUpgrade ? (
            <Link href={`${base}/billing`} className="font-medium underline">
              See plans
            </Link>
          ) : (
            "Ask a workspace admin to upgrade."
          )}
        </Alert>
      ) : null}

      <form method="get" role="search" className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_minmax(0,13rem)_minmax(0,13rem)_auto]">
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Search templates</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={q} placeholder="Search problems, solutions, value…" className="pl-9" />
        </label>
        <Select name="fn" defaultValue={fn ?? ""} aria-label="Business function">
          <option value="">All functions</option>
          {GROUPS.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.label}
            </option>
          ))}
        </Select>
        <Select name="industry" defaultValue={industry ?? "all"} aria-label="Industry">
          <option value="all">All industries</option>
          {INDUSTRIES.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.label}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("secondary")}>
            Filter
          </button>
          {filtered ? (
            <Link href={`${base}/initiatives/templates`} className={buttonClass("ghost")}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>
      <p className="mb-6 text-xs text-slate-500">
        {shown.length} template{shown.length === 1 ? "" : "s"}
        {industry ? ` for ${industryLabel(industry)} (general and industry-specific)` : " across all industries"}
        {addedCount > 0 ? ` · ${addedCount} already in your portfolio` : ""}
        {limit != null ? ` · ${planFor(ctx.org.plan).name} plan: ${Math.min(activeCount, limit)} of ${limit} initiatives used` : ""}
      </p>

      {groups.length === 0 ? (
        <EmptyState
          icon={<LibraryBig className="size-8" />}
          title="No templates match"
          description="Try another function or industry, or clear the search."
          action={
            <ButtonLink href={`${base}/initiatives/templates?industry=all`} variant="secondary">
              Show all templates
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.slug} aria-labelledby={`group-${g.slug}`}>
              <h2 id={`group-${g.slug}`} className="mb-3 flex items-baseline gap-2 text-sm font-semibold text-slate-900">
                {g.label}
                <span className="text-xs font-normal text-slate-500">{g.templates.length}</span>
              </h2>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {g.templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    tpl={t}
                    base={base}
                    slug={ctx.org.slug}
                    score={priorityScore(
                      { valueScore: t.scores.value, feasibilityScore: t.scores.feasibility, alignmentScore: t.scores.alignment, riskScore: t.scores.risk },
                      ctx.org.scoringWeights,
                    )}
                    existing={byTitle.get(t.title.toLowerCase())}
                    canWrite={canWrite}
                    canUpgrade={canUpgrade}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function TemplateCard({
  tpl,
  base,
  slug,
  score,
  existing,
  canWrite,
  canUpgrade,
}: {
  tpl: StarterTemplate;
  base: string;
  slug: string;
  score: number;
  existing?: { id: string; archivedAt: Date | null };
  canWrite: boolean;
  canUpgrade: boolean;
}) {
  const added = existing && !existing.archivedAt;
  return (
    <Card className="flex flex-col">
      <div className="flex-1 px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">{tpl.title}</h3>
          <Badge tone={EFFORT_TONE[tpl.effort]} className="shrink-0">
            {tpl.effort} effort
          </Badge>
        </div>
        {tpl.industries || tpl.customerFacing ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tpl.industries?.map((i) => (
            <Badge key={i} tone="violet">
              {industryLabel(i)}
            </Badge>
          ))}
          {tpl.customerFacing ? <Badge tone="amber">Customer-facing</Badge> : null}
        </div>
        ) : null}
        <p className="mt-3 text-sm text-slate-700">{tpl.problem}</p>
        <p className="mt-1.5 text-sm text-slate-500">{tpl.solution}</p>
        <h4 className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Typical value drivers</h4>
        <ul className="mt-1 space-y-0.5">
          {tpl.valueDrivers.map((v) => (
            <li key={v} className="flex gap-1.5 text-sm text-slate-700">
              <Check className="mt-0.5 size-3.5 shrink-0 text-radar-600" aria-hidden />
              {v}
            </li>
          ))}
        </ul>
      </div>
      <dl className="grid grid-cols-4 gap-px border-y border-slate-100 bg-slate-100 text-center">
        {(
          [
            ["Value", tpl.scores.value],
            ["Feasibility", tpl.scores.feasibility],
            ["Alignment", tpl.scores.alignment],
            ["Risk", tpl.scores.risk],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="bg-white px-1 py-2">
            <dt className="truncate text-[11px] text-slate-500">{label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {v}
              <span className="text-xs font-normal text-slate-400">/5</span>
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            Suggested priority <ScorePill score={score} />
          </div>
          <div className="mt-0.5 truncate">{labelFrom(BUILD_APPROACHES, tpl.buildApproach)}</div>
        </div>
        {added ? (
          <div className="flex items-center gap-2">
            <Badge tone="radar">
              <CheckCircle2 className="size-3.5" /> Added
            </Badge>
            <Link href={`${base}/initiatives/${existing.id}`} className="text-sm font-medium text-radar-700 hover:underline">
              Open
            </Link>
          </div>
        ) : canWrite ? (
          <div className="flex flex-col items-end gap-1">
            <AddTemplateButton slug={slug} templateId={tpl.id} canUpgrade={canUpgrade} />
            {existing?.archivedAt ? (
              <Link href={`${base}/initiatives/${existing.id}`} className="text-xs text-slate-500 hover:underline">
                Archived copy exists
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
