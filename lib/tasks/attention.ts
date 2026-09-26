import type { MyTaskRow } from "./queries";

export const TASK_ATTENTION_WINDOW_DAYS = 30;

function dayDiff(fromIso: string, toIso: string): number | null {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Execution views should contain work a person can act on now. Keep started
 * work visible regardless of date; unstarted work enters the queue when it is
 * undated, overdue, or within the next 30 days. Far-future work remains in the
 * same source of truth but is progressively disclosed under "Later".
 */
export function splitTasksByAttention<
  T extends Pick<MyTaskRow, "dueDate" | "status">,
>(
  tasks: T[],
  todayIso: string,
  windowDays = TASK_ATTENTION_WINDOW_DAYS
): { attention: T[]; later: T[] } {
  const attention: T[] = [];
  const later: T[] = [];

  for (const task of tasks) {
    const days = task.dueDate ? dayDiff(todayIso, task.dueDate) : null;
    const hasStarted = task.status === "in_progress" || task.status === "review";
    if (hasStarted || days === null || days <= windowDays) attention.push(task);
    else later.push(task);
  }

  return { attention, later };
}

export function selectPersonalWork<T extends Pick<MyTaskRow, "dueDate" | "status">>(tasks: T[], todayIso: string) {
  const open = tasks.filter(task => task.status !== "done");
  const working = open.filter(task => task.status === "in_progress" || task.status === "review");
  const unstarted = open.filter(task => task.status !== "in_progress" && task.status !== "review");
  const { attention, later } = splitTasksByAttention(unstarted, todayIso);
  return { working, attention, later, ordered: [...working, ...attention] };
}
