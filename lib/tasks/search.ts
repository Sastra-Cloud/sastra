import { formatInTimeZone } from "date-fns-tz";

import { formatDate } from "@/lib/format";
import { selectPersonalWork } from "./attention";
import type { MyWorkTaskRow } from "./queries";

/** My Work keeps done tasks this many days; older ones are found by search. */
export const MY_WORK_RECENT_DONE_DAYS = 7;
export const TASK_SEARCH_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const MAX_TERMS = 6;

type SearchableTask = Pick<MyWorkTaskRow, "title" | "description" | "projectTitle">;

/** Lower-case search words, or none when the query is too short to run. */
export function taskSearchTerms(query: string): string[] {
  const normalized = query.trim().toLowerCase().slice(0, MAX_QUERY_LENGTH);
  if (normalized.length < MIN_QUERY_LENGTH) return [];
  return [...new Set(normalized.split(/\s+/).filter(Boolean))].slice(0, MAX_TERMS);
}

/** Every word must appear in the title, project name, or description. */
export function matchesTaskSearch(task: SearchableTask, terms: string[]) {
  if (terms.length === 0) return false;
  const text = `${task.title}\n${task.projectTitle ?? ""}\n${task.description ?? ""}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

/** Title matches first; otherwise the incoming order is kept. */
export function rankTaskSearchMatches<T extends SearchableTask>(tasks: T[], terms: string[]): T[] {
  const score = (task: T) => {
    const title = task.title.toLowerCase();
    if (!terms.every((term) => title.includes(term))) return 2;
    return title.startsWith(terms[0]) ? 0 : 1;
  };
  return tasks
    .map((task, index) => ({ task, index, score: score(task) }))
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((item) => item.task);
}

/** Make a typed `%` or `_` match itself in an ILIKE pattern. */
export function escapeLikePattern(term: string) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function doneLabel(completedAt: Date | string | null, todayIso: string, timeZone: string) {
  if (!completedAt) return "Done";
  const day = formatInTimeZone(new Date(completedAt), timeZone, "yyyy-MM-dd");
  return day === todayIso ? "Done today" : `Done ${formatDate(day)}`;
}

/**
 * Where each loaded task appears in the Focus view, so a person can find work
 * hidden in a collapsed section or past the first five rows.
 */
export function myWorkTaskLocations(
  tasks: MyWorkTaskRow[],
  todayIso: string,
  timeZone: string
): Map<string, string> {
  const work = selectPersonalWork(tasks, todayIso, timeZone);
  const locations = new Map<string, string>();
  const place = (rows: MyWorkTaskRow[], label: string) => {
    for (const task of rows) if (!locations.has(task.id)) locations.set(task.id, label);
  };
  place(work.nextUp, "In Next up");
  place(work.blockedNextUp, "In Next up · blocked");
  place(work.remainingDueToday, "In Due today");
  place(work.fromTeammates, "In From teammates");
  place(work.working, "In Working now");
  place(work.attention, "In Other assigned work");
  place(work.waiting, "In Waiting on confirmation");
  place(work.later, "In Later");
  for (const task of tasks) {
    if (task.status === "done") locations.set(task.id, doneLabel(task.completedAt, todayIso, timeZone));
  }
  return locations;
}

/** Why a search result is not in the person's My Work lists. */
export function otherTaskReason(
  task: Pick<MyWorkTaskRow, "status" | "completedAt" | "assignedTo" | "assigneeName">,
  currentUserId: string,
  todayIso: string,
  timeZone: string
) {
  const owner = !task.assignedTo
    ? "Not assigned"
    : task.assignedTo === currentUserId
      ? null
      : `Assigned to ${task.assigneeName ?? "a teammate"}`;
  const done = task.status === "done" ? doneLabel(task.completedAt, todayIso, timeZone) : null;
  return [done, owner].filter(Boolean).join(" · ");
}
