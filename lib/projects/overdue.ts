/** Pure project-overdue reasoning (no DB) so it's unit-testable. */

import { daysUntil } from "@/lib/format";

const CLOSED_STATUSES = new Set(["completed", "cancelled"]);

export type OverdueInput = {
  dueDate: string | null;
  status: string;
  totalTasks: number;
  doneTasks: number;
  /** Tasks that are not done and past their own due date. */
  overdueTasks: number;
  blockerCount: number;
};

export type OverdueSummary = {
  daysOverdue: number;
  allDone: boolean;
  reasons: string[];
};

/**
 * Returns why a project is overdue, or null when it isn't overdue (future/no due
 * date) or is completed/cancelled.
 */
export function computeOverdue(input: OverdueInput): OverdueSummary | null {
  const d = daysUntil(input.dueDate);
  if (d === null || d >= 0 || CLOSED_STATUSES.has(input.status)) return null;

  const { totalTasks, doneTasks, overdueTasks, blockerCount } = input;
  const openTasks = Math.max(0, totalTasks - doneTasks);
  const allDone = totalTasks > 0 && openTasks === 0;

  const reasons: string[] = [];
  if (allDone) {
    reasons.push(
      `All ${totalTasks} task${totalTasks === 1 ? " is" : "s are"} done, but the project isn't marked complete yet.`
    );
  } else if (totalTasks === 0) {
    reasons.push("No tasks have been added to the plan yet.");
  } else {
    reasons.push(
      `${openTasks} of ${totalTasks} tasks still open` +
        (overdueTasks > 0
          ? ` — ${overdueTasks} past ${overdueTasks === 1 ? "its" : "their"} own due date.`
          : ".")
    );
  }
  if (blockerCount > 0) {
    reasons.push(
      `${blockerCount} open blocker${blockerCount === 1 ? "" : "s"} still to resolve.`
    );
  }
  return { daysOverdue: Math.abs(d), allDone, reasons };
}
