type DatedTask = {
  dueDate: string | null;
};

/**
 * Keep the most time-sensitive work at the top of each project task column.
 * ISO dates sort chronologically as strings. Returning zero preserves the
 * board's existing rank/order for equal dates and for undated tasks.
 */
export function compareTaskBoardDueDate(a: DatedTask, b: DatedTask): number {
  if (a.dueDate === b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}
