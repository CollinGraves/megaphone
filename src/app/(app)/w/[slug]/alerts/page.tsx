import { BellRing } from "lucide-react";
import type { Metadata } from "next";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getWorkspaceOrNotFound } from "@/lib/workspace";
import { AlertList } from "../_components/alert-list";
import { loadOpenAlerts } from "../_lib/alerts";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Radar alerts" };

export default async function AlertsPage({ params }: PageProps<"/w/[slug]/alerts">) {
  const { slug } = await params;
  const ctx = await getWorkspaceOrNotFound(slug);
  const alerts = await loadOpenAlerts(ctx.org.id);
  const initiativeCount = new Set(alerts.map((a) => a.initiativeId)).size;

  return (
    <>
      <PageHeader
        eyebrow={`${BRAND}`}
        title="Radar alerts"
        description="When a pricing change, deprecation, security issue, model release or regulation hits a platform one of your initiatives is built on, it shows up here."
      />
      {alerts.length === 0 ? (
        <EmptyState
          icon={<BellRing className="size-8" />}
          title="You’re all caught up"
          description="No open alerts. Make sure each initiative lists its platforms so Radar can match news to it."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {alerts.length} open alert{alerts.length === 1 ? "" : "s"} across {initiativeCount} initiative{initiativeCount === 1 ? "" : "s"}
          </p>
          <Card>
            <AlertList alerts={alerts} slug={ctx.org.slug} canDismiss={ctx.can("initiative:write")} />
          </Card>
        </>
      )}
    </>
  );
}
