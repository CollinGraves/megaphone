import { PENDING_STALE_DAYS, REVIEW_DUE_SOON_DAYS, daysBetween, isApproved } from "./governance";

export type ReminderInitiative = {
  id: string;
  title: string;
  stage: string;
  archivedAt: Date | null;
  approvalStatus: string;
  reviewDueOn: string | null;
  approvalRequestedAt: Date | null;
};

export type ReminderDigest<T extends ReminderInitiative = ReminderInitiative> = {
  overdue: (T & { days: number })[];
  dueSoon: (T & { days: number })[];
  stalePending: (T & { days: number })[];
};

/**
 * What approvers should hear about this week: approvals whose periodic review is overdue or due within
 * REVIEW_DUE_SOON_DAYS, and review requests waiting longer than PENDING_STALE_DAYS. Retired/archived skip.
 */
export function selectReminders<T extends ReminderInitiative>(items: readonly T[], today: string): ReminderDigest<T> {
  const active = items.filter((i) => !i.archivedAt && i.stage !== "retired");
  const overdue: (T & { days: number })[] = [];
  const dueSoon: (T & { days: number })[] = [];
  const stalePending: (T & { days: number })[] = [];
  for (const i of active) {
    if (isApproved(i.approvalStatus) && i.reviewDueOn) {
      const days = daysBetween(today, i.reviewDueOn);
      if (days < 0) overdue.push({ ...i, days: -days });
      else if (days <= REVIEW_DUE_SOON_DAYS) dueSoon.push({ ...i, days });
    }
    if (i.approvalStatus === "pending" && i.approvalRequestedAt) {
      const days = daysBetween(i.approvalRequestedAt.toISOString().slice(0, 10), today);
      if (days > PENDING_STALE_DAYS) stalePending.push({ ...i, days });
    }
  }
  overdue.sort((a, b) => b.days - a.days);
  dueSoon.sort((a, b) => a.days - b.days);
  stalePending.sort((a, b) => b.days - a.days);
  return { overdue, dueSoon, stalePending };
}

export const reminderCount = (d: ReminderDigest) => d.overdue.length + d.dueSoon.length + d.stalePending.length;
