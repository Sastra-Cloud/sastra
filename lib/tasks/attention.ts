import type { MyTaskRow } from "./queries";
import { formatInTimeZone } from "date-fns-tz";

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

export function selectPersonalWork<T extends Pick<MyTaskRow, "dueDate" | "status"> & PaymentTaskTiming>(tasks: T[], todayIso: string, timeZone = "UTC") {
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
  const working = ordinary.filter(task => task.status === "in_progress" || task.status === "review");
  const unstarted = ordinary.filter(task => task.status !== "in_progress" && task.status !== "review");
  const { attention, later } = splitTasksByAttention(unstarted, todayIso);
  // Today's deadlines have their own uncapped section. Keep the existing order
  // within every group, and never duplicate a task between sections.
  return { dueToday, working, waiting, followUpDue, attention: [...followUpDue, ...attention], later, ordered: [...dueToday, ...working, ...followUpDue, ...attention] };
}
