import { BellRing, Database, LayoutDashboard, ListChecks, Settings } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui";
import { ORG_ROLES, labelFrom } from "@/lib/taxonomy";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { WorkspaceNav, type NavItem } from "./_components/client";
import { countOpenAlerts } from "./_lib/alerts";

const PLAN_LABELS: Record<string, string> = { engagement: "Engagement", trial: "Trial", pro: "Pro", enterprise: "Enterprise" };

export async function generateMetadata({ params }: LayoutProps<"/w/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  return { title: { template: `%s · ${ctx.org.name} · AI Radar`, default: `${ctx.org.name} · AI Radar` } };
}

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[slug]">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const alertCount = await countOpenAlerts(ctx.org.id);
  const base = `/w/${ctx.org.slug}`;

  const nav: NavItem[] = [
    { href: base, label: "Dashboard", icon: <LayoutDashboard />, exact: true },
    { href: `${base}/initiatives`, label: "Initiatives", icon: <ListChecks /> },
    { href: `${base}/systems`, label: "Systems & data", icon: <Database /> },
    { href: `${base}/alerts`, label: "Radar alerts", icon: <BellRing />, count: alertCount },
    { href: `${base}/settings`, label: "Settings", icon: <Settings /> },
  ];

  const roleLabel = labelFrom(ORG_ROLES, ctx.access.role);
  const viewingAs =
    ctx.access.via === "consultant"
      ? `Viewing as North Labs consultant · ${roleLabel} access`
      : ctx.access.via === "platform_admin"
        ? `Viewing as North Labs admin · ${roleLabel} access`
        : `Your role: ${roleLabel}`;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:flex lg:gap-8 lg:py-8">
      <aside className="mb-6 lg:sticky lg:top-20 lg:mb-0 lg:w-56 lg:shrink-0 lg:self-start">
        <div className="mb-3 flex items-start justify-between gap-3 lg:mb-5 lg:block">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">AI workspace</div>
            <div className="mt-0.5 truncate text-base font-semibold text-slate-900" title={ctx.org.name}>
              {ctx.org.name}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:mt-2">
            <Badge tone="dark">{PLAN_LABELS[ctx.org.plan] ?? ctx.org.plan}</Badge>
            {ctx.org.status === "suspended" ? <Badge tone="red">Suspended</Badge> : null}
          </div>
        </div>
        <WorkspaceNav items={nav} />
        <p
          className={
            ctx.access.via === "membership"
              ? "mt-4 hidden text-xs text-slate-500 lg:block"
              : "mt-3 rounded-md bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-800 ring-1 ring-violet-200 lg:mt-5"
          }
        >
          {viewingAs}
        </p>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
