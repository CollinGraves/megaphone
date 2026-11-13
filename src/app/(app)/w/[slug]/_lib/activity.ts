import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityLog, initiatives, user } from "@/db/schema";
import { ACCESS_STATUSES, ORG_ROLES, labelFrom } from "@/lib/taxonomy";
import { formatDate, formatNumber } from "@/lib/utils";
import { describeGovernanceEvent } from "../governance/governance-ui";
import { describeBillingEvent } from "@/lib/billing/activity";

export type ActivityRow = {
  id: string;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: Date;
  userName: string | null;
  initiativeId: string | null;
  initiativeTitle: string | null;
};

export async function loadActivity(orgId: string, opts: { initiativeId?: string; limit?: number } = {}): Promise<ActivityRow[]> {
  return db
    .select({
      id: activityLog.id,
      action: activityLog.action,
      detail: activityLog.detail,
      createdAt: activityLog.createdAt,
      userName: user.name,
      initiativeId: activityLog.initiativeId,
      initiativeTitle: initiatives.title,
    })
    .from(activityLog)
    .leftJoin(user, eq(activityLog.userId, user.id))
    .leftJoin(initiatives, eq(activityLog.initiativeId, initiatives.id))
    .where(and(eq(activityLog.orgId, orgId), opts.initiativeId ? eq(activityLog.initiativeId, opts.initiativeId) : undefined))
    .orderBy(desc(activityLog.createdAt))
    .limit(opts.limit ?? 20);
}

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Human-readable description of an activity entry (without the actor). */
export function describeActivity(action: string, detail: Record<string, unknown> | null): string {
  const d = detail ?? {};
  switch (action) {
    case "initiative.created":
      return d.template ? "created the initiative from a template" : "created the initiative";
    case "initiative.updated": {
      const changes = Array.isArray(d.changes) ? (d.changes as unknown[]).map(s).filter(Boolean) : [];
      return changes.length ? `updated ${changes.join(", ")}` : "updated the initiative";
    }
    case "initiative.archived":
      return "archived the initiative";
    case "initiative.restored":
      return "restored the initiative";
    case "initiative.deleted":
      return `deleted the initiative “${s(d.title)}”`;
    case "metric.added":
      return `added impact metric “${s(d.metric)}”`;
    case "metric.updated":
      return `updated impact metric “${s(d.metric)}”`;
    case "metric.removed":
      return `removed impact metric “${s(d.metric)}”`;
    case "measurement.recorded":
      return `recorded ${formatNumber(Number(d.value))} for “${s(d.metric)}” (${formatDate(s(d.period), { month: "short", year: "numeric" })})`;
    case "measurement.removed":
      return `removed a measurement for “${s(d.metric)}”`;
    case "dependency.added":
      return `added a data dependency on ${s(d.system)}`;
    case "dependency.updated":
      return `set ${s(d.system)} access to ${labelFrom(ACCESS_STATUSES, s(d.accessStatus)).toLowerCase()}`;
    case "dependency.removed":
      return `removed the data dependency on ${s(d.system)}`;
    case "system.created":
      return `added system ${s(d.name)}`;
    case "system.updated":
      return `updated system ${s(d.name)}`;
    case "system.deleted":
      return `deleted system ${s(d.name)}`;
    case "comment.added":
      return "commented";
    case "comment.deleted":
      return "deleted a comment";
    case "alert.dismissed":
      return `dismissed a Radar alert${d.story ? ` (“${s(d.story)}”)` : ""}`;
    case "member.invited":
      return `invited ${s(d.email)} as ${labelFrom(ORG_ROLES, s(d.role)).toLowerCase()}`;
    case "member.added":
      return `added ${s(d.email)} as ${labelFrom(ORG_ROLES, s(d.role)).toLowerCase()}`;
    case "member.role_changed":
      return `changed ${s(d.name)}’s role to ${labelFrom(ORG_ROLES, s(d.role)).toLowerCase()}`;
    case "member.removed":
      return `removed ${s(d.name)} from the workspace`;
    case "invitation.revoked":
      return `revoked the invitation for ${s(d.email)}`;
    case "settings.updated":
      return "updated workspace settings";
    case "weights.updated":
      return "changed the prioritization weights";
    case "export.csv":
      return "exported the portfolio to CSV";
    case "idea.submitted":
      return `submitted the idea “${s(d.title)}”${d.channel === "intake_link" ? " via the intake link" : d.via === "mcp" ? " via MCP" : ""}`;
    case "idea.under_review":
      return `moved “${s(d.title)}” to review`;
    case "idea.reopened":
      return `reopened the idea “${s(d.title)}”`;
    case "idea.notes_updated":
      return `updated triage notes on “${s(d.title)}”`;
    case "idea.accepted":
      return `turned the idea “${s(d.title)}” into an initiative`;
    case "idea.declined":
      return `declined the idea “${s(d.title)}”`;
    case "idea.duplicate":
      return `marked “${s(d.title)}” as a duplicate`;
    case "intake.enabled":
      return "turned on the idea intake link";
    case "intake.disabled":
      return "turned off the idea intake link";
    case "intake.rotated":
      return "issued a new idea intake link";
    case "intake.domains_updated":
      return "updated who can submit ideas";
    case "impact.recorded":
      return `recorded ${formatNumber(Number(d.value))} for “${s(d.metric)}” (${s(d.period)})${d.via === "mcp" ? " via MCP" : ""}`;
    case "onboarding.dismissed":
      return d.complete ? "hid the setup checklist" : `dismissed the setup checklist${typeof d.percent === "number" ? ` at ${d.percent}%` : ""}`;
    case "workspace.created_from_assessment":
      return "created this workspace from an AI readiness assessment";
    case "workspace.created":
      return "created this workspace";
    default:
      if (action.startsWith("governance.")) return describeGovernanceEvent(action, d);
      if (action.startsWith("billing.")) return describeBillingEvent(action, d);
      return action.replace(/[._]/g, " ");
  }
}
