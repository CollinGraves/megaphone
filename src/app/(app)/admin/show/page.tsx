import type { Metadata } from "next";
import Link from "next/link";
import { Mic } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireStaff } from "@/lib/auth/session";
import { SHOW_NAME } from "@/lib/brand";
import { parseRundown, runtimeMinutes } from "@/lib/show/rundown";
import { listEpisodes, loadInsights } from "@/lib/show/server";
import { formatDate } from "@/lib/utils";
import { createEpisodeAction } from "./actions";

export const metadata: Metadata = { title: "Show" };
// Creating an episode writes its rundown after the response; give the function room to finish.
export const maxDuration = 300;

/** The next weekday after `from` (shows air on weekdays). */
function nextWeekday(from: Date) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Default news window: the days since the last episode aired (1–14), else 3. */
function defaultWindowDays(lastAirDate: string | undefined) {
  if (!lastAirDate) return 3;
  const days = Math.round((Date.now() - new Date(`${lastAirDate}T12:00:00Z`).getTime()) / 864e5);
  return days >= 1 ? Math.min(days, 14) : 3;
}

export default async function ShowAdminPage() {
  await requireStaff();
  const [list, insights] = await Promise.all([listEpisodes(), loadInsights()]);
  const defaultWindow = defaultWindowDays(list[0]?.airDate);

  return (
    <>
      <PageHeader
        eyebrow={SHOW_NAME}
        title="Show prep"
        description="Build each episode's rundown from the top stories, add build-it-live and by-the-numbers segments, then publish an episode page with show notes."
        actions={
          <Link href="/show" className="text-sm text-radar-700 hover:underline">
            Public show page →
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {list.length ? (
            <Card className="overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <Th>#</Th>
                    <Th>Episode</Th>
                    <Th>Air date</Th>
                    <Th>Runtime</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((ep) => {
                    const r = parseRundown(ep.rundown);
                    return (
                      <tr key={ep.id} className="border-t border-slate-100">
                        <Td className="tabular-nums text-slate-500">{ep.number}</Td>
                        <Td>
                          <Link href={`/admin/show/${ep.id}`} className="font-medium text-slate-900 hover:text-radar-700">
                            {ep.title}
                          </Link>
                          <div className="text-xs text-slate-500">
                            {r ? `${r.segments.length} segments · ${ep.storyIds.length} stories` : ep.prepStatus === "generating" ? "Writing rundown…" : "No rundown"}
                          </div>
                        </Td>
                        <Td>{formatDate(ep.airDate)}</Td>
                        <Td className="tabular-nums">{r ? `~${runtimeMinutes(r)} min` : "—"}</Td>
                        <Td>
                          {ep.prepStatus === "failed" ? (
                            <Badge tone="red">Prep failed</Badge>
                          ) : (
                            <Badge tone={ep.status === "published" ? "radar" : "neutral"}>{ep.status === "published" ? "Published" : "Draft"}</Badge>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          ) : (
            <EmptyState icon={<Mic className="size-6" />} title="No episodes yet" description="Create the first one: it pulls the top stories and writes a rundown with talking points and hot takes." />
          )}
        </div>
        <aside className="space-y-6">
          <Card>
            <CardHeader title="New episode" description="Picks the strongest stories in the window, varied across vendors." />
            <CardBody>
              <ActionForm action={createEpisodeAction}>
                <Field label="Air date" htmlFor="airDate">
                  <Input id="airDate" name="airDate" type="date" required defaultValue={nextWeekday(new Date())} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="News from last (days)" htmlFor="sinceDays">
                    <Input id="sinceDays" name="sinceDays" type="number" min={1} max={14} required defaultValue={defaultWindow} />
                  </Field>
                  <Field label="Stories" htmlFor="count">
                    <Input id="count" name="count" type="number" min={1} max={10} required defaultValue={6} />
                  </Field>
                </div>
                <SubmitButton className="w-full" pendingText="Creating…">
                  Create episode & write rundown
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
          <Card className="p-5 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">By-the-numbers data</div>
            <p className="mt-1">
              {insights.eligible
                ? `${insights.orgCount} opted-in workspaces with ${insights.initiativeCount} initiatives. Ready for a data segment.`
                : `${insights.orgCount} opted-in workspace${insights.orgCount === 1 ? "" : "s"} with initiatives so far; the data segment unlocks at 5.`}
            </p>
            <p className="mt-2 text-xs text-slate-500">Workspace owners opt in under Settings. Only rounded aggregates are ever shown.</p>
          </Card>
        </aside>
      </div>
    </>
  );
}
