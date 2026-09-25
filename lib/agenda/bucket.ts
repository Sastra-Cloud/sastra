/**
 * Time-bucketing for the cross-project agenda. Pure — the "today" reference is
 * injected (yyyy-mm-dd) so it's deterministic and unit-testable.
 */

export type AgendaKind =
  | "task"
  | "milestone"
  | "mou_payment"
  | "royalty_payment"
  | "license_fee"
  | "print_payment"
  | "license_renewal"
  | "mou_expiry"
  | "rights_complete_by"
  | "project_due";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  title: string;
  /** yyyy-mm-dd */
  date: string;
  projectId: string | null;
  projectSlug: string | null;
  projectTitle: string | null;
  amount: string | null;
  currency: string | null;
  assigneeName: string | null;
  href: string;
};

export type AgendaBuckets = {
  overdue: AgendaItem[];
  thisWeek: AgendaItem[];
  next2Weeks: AgendaItem[];
  later: AgendaItem[];
};

/** Whole-day difference between two yyyy-mm-dd dates (toIso − fromIso). */
export function dayDiff(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Money items and milestones sort ahead of ordinary tasks on the same day. */
const KIND_PRIORITY: Record<AgendaKind, number> = {
  project_due: 0,
  milestone: 1,
  mou_payment: 2,
  print_payment: 2,
  royalty_payment: 2,
  license_fee: 2,
  license_renewal: 3,
  mou_expiry: 3,
  rights_complete_by: 3,
  task: 4,
};

function sortItems(a: AgendaItem, b: AgendaItem): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const pa = KIND_PRIORITY[a.kind] ?? 9;
  const pb = KIND_PRIORITY[b.kind] ?? 9;
  if (pa !== pb) return pa - pb;
  return a.title.localeCompare(b.title);
}

/**
 * Split agenda items into overdue / this week (0–7d) / next two weeks (8–21d) /
 * later (22d+), each sorted by date then kind priority.
 */
export function bucketAgenda(items: AgendaItem[], todayIso: string): AgendaBuckets {
  const buckets: AgendaBuckets = {
    overdue: [],
    thisWeek: [],
    next2Weeks: [],
    later: [],
  };
  for (const item of items) {
    const d = dayDiff(todayIso, item.date);
    if (d < 0) buckets.overdue.push(item);
    else if (d <= 7) buckets.thisWeek.push(item);
    else if (d <= 21) buckets.next2Weeks.push(item);
    else buckets.later.push(item);
  }
  buckets.overdue.sort(sortItems);
  buckets.thisWeek.sort(sortItems);
  buckets.next2Weeks.sort(sortItems);
  buckets.later.sort(sortItems);
  return buckets;
}
