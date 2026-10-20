import { printPaymentFollowUp } from "@/lib/tasks/attention";

export type NavigationBadgeCounts = {
  dueTasks: number;
  taskSuggestions: number;
  followUps: number;
  correspondence: number;
  chat: number;
  standups: number;
};

export type NavigationBadge = { count: number; description: string; href?: string };

export const EMPTY_NAVIGATION_BADGES: NavigationBadgeCounts = {
  dueTasks: 0,
  taskSuggestions: 0,
  followUps: 0,
  correspondence: 0,
  chat: 0,
  standups: 0,
};

type AttentionTask = Parameters<typeof printPaymentFollowUp>[0] & {
  status: string;
  assignedTo: string | null;
};

/** Matches My Work's payment follow-up timing, including its waiting period. */
export function selectDueWorkTasks<T extends AttentionTask>(
  tasks: T[],
  userId: string,
  today: string,
  timeZone: string
) {
  return tasks.filter((task) => {
    if (task.assignedTo !== userId || task.status === "done") return false;
    const followUp = printPaymentFollowUp(task, today, timeZone);
    if (followUp?.state === "waiting") return false;
    const due = followUp?.date ?? task.dueDate;
    return due !== null && due <= today;
  });
}

export function countDueWorkTasks(tasks: AttentionTask[], userId: string, today: string, timeZone: string) {
  return selectDueWorkTasks(tasks, userId, today, timeZone).length;
}

function quantity(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Only destinations with a durable unread or actionable-work signal earn badges. */
export function navigationBadgeFor(
  href: string,
  counts: NavigationBadgeCounts
): NavigationBadge | null {
  let badge: NavigationBadge | null = null;
  if (href === "/tasks") {
    const parts = [
      counts.dueTasks > 0 ? `${quantity(counts.dueTasks, "task")} due or overdue` : null,
      counts.taskSuggestions > 0 ? `${quantity(counts.taskSuggestions, "task suggestion")} to review` : null,
      counts.followUps > 0 ? `${quantity(counts.followUps, "follow-up")} due` : null,
    ].filter(Boolean);
    badge = {
      count: counts.dueTasks + counts.taskSuggestions + counts.followUps,
      description: parts.join(", "),
    };
  } else if (href === "/chat") {
    badge = { count: counts.chat, description: quantity(counts.chat, "unread message") };
  } else if (href === "/standups") {
    badge = { count: counts.standups, description: `${quantity(counts.standups, "check-in")} waiting for you` };
  } else if (href === "/correspondence") {
    badge = {
      count: counts.correspondence,
      description: `${quantity(counts.correspondence, "email thread")} with shared reviews or unassigned follow-ups`,
      href: "/correspondence?bucket=review",
    };
  }
  return badge && badge.count > 0 ? badge : null;
}

export function navigationBadgeText(count: number) {
  return count > 99 ? "99+" : String(count);
}
