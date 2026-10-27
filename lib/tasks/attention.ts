import type { MyTaskRow } from "./queries";
import { formatInTimeZone } from "date-fns-tz";
import { isUndatedTeammateRequest, type TaskAssignmentContext } from "./assignment";

export const TASK_ATTENTION_WINDOW_DAYS = 30;

type PaymentTaskTiming = {
  printPaymentStatus?: string | null;
  printWireRequestedAt?: Date | string | null;
  printPaymentDueDate?: string | null;
  printPaymentNeededByDate?: string | null;
  dueDate: string | null;
};

function addBusinessDays(dateIso: string, count: number): string {
  const day = new Date(`${dateIso}T12:00:00Z`);
  let added = 0;
  while (added < count) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) added += 1;
  }
  return day.toISOString().slice(0, 10);
}

export function printPaymentFollowUp(task: PaymentTaskTiming, todayIso: string, timeZone = "UTC"):
  { state: "waiting" | "due"; date: string } | null {
  if (task.printPaymentStatus !== "requested") return null;
  if (!task.printWireRequestedAt) return { state: "due", date: todayIso };
  const requestedDate = formatInTimeZone(new Date(task.printWireRequestedAt), timeZone, "yyyy-MM-dd");
  const dates = [
    addBusinessDays(requestedDate, 3),
    task.printPaymentDueDate,
    task.printPaymentNeededByDate,
    task.dueDate,
  ].filter((value): value is string => Boolean(value));
  const date = dates.sort()[0];
  return { state: date <= todayIso ? "due" : "waiting", date };
}

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

export function selectPersonalWork<T extends Pick<MyTaskRow, "id" | "dueDate" | "status"> & PaymentTaskTiming & TaskAssignmentContext & { isNextUp?: boolean; rank?: number; priority?: string; blockedByTitle?: string | null }>(tasks: T[], todayIso: string, timeZone = "UTC", nextUpLimit = Infinity) {
  const open = tasks.filter(task => task.status !== "done");
  const dueToday: T[] = [];
  const waiting: T[] = [];
  const followUpDue: T[] = [];
  const ordinary: T[] = [];
  for (const task of open) {
    const followUp = printPaymentFollowUp(task, todayIso, timeZone);
    if (followUp?.state === "waiting") waiting.push(task);
    else if ((followUp?.date ?? task.dueDate) === todayIso) dueToday.push(task);
    else if (followUp?.state === "due") followUpDue.push(task);
    else ordinary.push(task);
  }
  const byFollowUpDate = (a: T, b: T) =>
    (printPaymentFollowUp(a, todayIso, timeZone)?.date ?? "").localeCompare(
      printPaymentFollowUp(b, todayIso, timeZone)?.date ?? ""
    );
  waiting.sort(byFollowUpDate);
  followUpDue.sort(byFollowUpDate);
  const waitingSet = new Set(waiting.map(task => task.id));
  const selected = open.filter(task => task.isNextUp && !waitingSet.has(task.id));
  const blockedNextUp = selected.filter(task => Boolean(task.blockedByTitle));
  const allNextUp = selected.filter(task => !task.blockedByTitle).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  const nextUp = allNextUp.slice(0, nextUpLimit);
  const displayedNext = new Set([...nextUp, ...blockedNextUp].map(task => task.id));
  const selectedIds = new Set(selected.map(task => task.id));
  const remainingDueToday = dueToday.filter(task => !displayedNext.has(task.id));
  const remainingOrdinary = ordinary.filter(task => !selectedIds.has(task.id));
  const working = remainingOrdinary.filter(task => task.status === "in_progress" || task.status === "review");
  const unstarted = remainingOrdinary.filter(task => task.status !== "in_progress" && task.status !== "review");
  const teammateRequests = unstarted.filter(isUndatedTeammateRequest);
  const fromTeammates = teammateRequests.filter(task => !task.assignmentDeferredAt);
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const assignmentTime = (task: T) => task.assignedAt ? new Date(task.assignedAt).getTime() || 0 : 0;
  fromTeammates.sort((a, b) =>
    (priorityOrder[a.priority ?? "medium"] ?? 2) - (priorityOrder[b.priority ?? "medium"] ?? 2) ||
    assignmentTime(b) - assignmentTime(a) || (a.rank ?? 0) - (b.rank ?? 0) || a.id.localeCompare(b.id)
  );
  const deferred = teammateRequests.filter(task => Boolean(task.assignmentDeferredAt));
  const requestIds = new Set(teammateRequests.map(task => task.id));
  const { attention, later } = splitTasksByAttention(unstarted.filter(task => !requestIds.has(task.id)), todayIso);
  // Today's full deadline set stays represented across Next up and Due today.
  // Preserve order within the other groups and never duplicate their task IDs.
  const remainingFollowUps = followUpDue.filter(task => !selectedIds.has(task.id));
  return { dueToday, remainingDueToday, nextUp, nextUpCount: allNextUp.length, selectedCount: open.filter(task => task.isNextUp).length, blockedNextUp, fromTeammates, working, waiting, followUpDue: remainingFollowUps, attention: [...remainingFollowUps, ...attention], later: [...deferred, ...later], ordered: [...nextUp, ...remainingDueToday, ...fromTeammates, ...working, ...remainingFollowUps, ...attention] };
}
