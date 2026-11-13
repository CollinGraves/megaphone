import { describe, expect, it } from "vitest";
import { reminderCount, selectReminders, type ReminderInitiative } from "./governance-reminders";

const base: ReminderInitiative = { id: "x", title: "X", stage: "production", archivedAt: null, approvalStatus: "approved", reviewDueOn: null, approvalRequestedAt: null };
const today = "2026-11-16";

describe("selectReminders", () => {
  it("buckets overdue, due-soon and stale pending reviews", () => {
    const d = selectReminders(
      [
        { ...base, id: "a", reviewDueOn: "2026-11-01" }, // overdue 15d
        { ...base, id: "b", approvalStatus: "conditional", reviewDueOn: "2026-12-01" }, // due in 15d
        { ...base, id: "c", reviewDueOn: "2027-06-01" }, // far away
        { ...base, id: "d", approvalStatus: "pending", approvalRequestedAt: new Date("2026-10-20T10:00:00Z") }, // 27d
        { ...base, id: "e", approvalStatus: "pending", approvalRequestedAt: new Date("2026-11-10T10:00:00Z") }, // 6d, fine
        { ...base, id: "f", reviewDueOn: "2026-01-01", stage: "retired" }, // retired: skip
        { ...base, id: "g", reviewDueOn: "2026-01-01", archivedAt: new Date() }, // archived: skip
        { ...base, id: "h", approvalStatus: "rejected", reviewDueOn: "2026-01-01" }, // not an approval in force
      ],
      today,
    );
    expect(d.overdue.map((i) => [i.id, i.days])).toEqual([["a", 15]]);
    expect(d.dueSoon.map((i) => [i.id, i.days])).toEqual([["b", 15]]);
    expect(d.stalePending.map((i) => [i.id, i.days])).toEqual([["d", 27]]);
    expect(reminderCount(d)).toBe(3);
  });
  it("is empty when nothing needs attention", () => {
    expect(reminderCount(selectReminders([{ ...base, reviewDueOn: "2027-12-01" }], today))).toBe(0);
  });
});
