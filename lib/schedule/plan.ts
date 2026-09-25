/**
 * Pure portfolio-scheduling helpers. No DB, no `window` — safe on the client
 * (the schedule board runs `autoSchedule` live) and unit-testable.
 */

import { addMonths, durationForKind, type DurationByKind } from "@/lib/planning/capacity";

export type ScheduleInput = {
  id: string;
  deadline: string | null;
  kind: string | null;
  estimatedDurationMonths: number | null;
};

export type ScheduledProject = {
  id: string;
  start: string;
  end: string;
  durationMonths: number;
  /** Planned end falls after the contractual deadline. */
  late: boolean;
};

function earliestSlot(slots: string[]): number {
  let si = 0;
  for (let i = 1; i < slots.length; i++) if (slots[i] < slots[si]) si = i;
  return si;
}

/**
 * Greedy capacity scheduler: place each project into the earliest-free slot,
 * earliest-deadline first, so no more than `concurrency` run at once. Projects
 * already underway are passed via `occupiedUntil` (their planned end dates) so
 * their slots aren't handed out before they finish. Returns a start/end per
 * project and whether it lands after its deadline.
 */
export function autoSchedule(
  projects: ScheduleInput[],
  concurrency: number,
  today: string,
  durations: DurationByKind,
  occupiedUntil: string[] = []
): ScheduledProject[] {
  const slots = new Array<string>(Math.max(1, Math.floor(concurrency))).fill(today);
  for (const end of [...occupiedUntil].filter((e) => e > today).sort()) {
    const si = earliestSlot(slots);
    if (end > slots[si]) slots[si] = end;
  }

  const order = [...projects].sort((a, b) => {
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  const out: ScheduledProject[] = [];
  for (const p of order) {
    const si = earliestSlot(slots);
    const start = slots[si] > today ? slots[si] : today;
    const months = p.estimatedDurationMonths ?? durationForKind(durations, p.kind);
    const end = addMonths(start, months);
    slots[si] = end;
    out.push({
      id: p.id,
      start,
      end,
      durationMonths: months,
      late: p.deadline ? end > p.deadline : false,
    });
  }
  return out;
}

export type SlotCompletion = {
  /** When a slot is expected to free for the new project (today if one is free). */
  slotOpen: string;
  /** Suggested completion = slotOpen + duration. */
  completion: string;
  openNow: boolean;
  /** Books genuinely in production right now (holding a slot). */
  runningCount: number;
};

/**
 * A bounded completion estimate: the new project starts when a currently-running
 * book frees a slot (or now, if one is free), then takes its typical duration.
 * Only work actually in production counts toward the slots — so the date stays
 * near-term instead of queuing behind the whole deadline backlog. The
 * over-commitment (overdue + queued books) is surfaced separately as context.
 */
export function nextSlotCompletion(
  runningFinishes: string[],
  concurrency: number,
  durationMonths: number,
  today: string
): SlotCompletion {
  const slots = Math.max(1, Math.floor(concurrency));
  const dur = Math.max(1, Math.floor(durationMonths));
  const active = runningFinishes.filter((f) => f > today).sort();
  if (active.length < slots) {
    return { slotOpen: today, completion: addMonths(today, dur), openNow: true, runningCount: active.length };
  }
  // A slot frees once enough running books finish; the gating finish is the one
  // that drops the count below `slots`.
  const gate = active[active.length - slots];
  const slotOpen = gate > today ? gate : today;
  return { slotOpen, completion: addMonths(slotOpen, dur), openNow: false, runningCount: active.length };
}

/** Concurrent-project count sampled at the first of each month in [min, max]. */
export function monthlyLoad(
  intervals: { start: string; end: string }[],
  minYmd: string,
  maxYmd: string
): { ymd: string; count: number }[] {
  const [y0, m0] = minYmd.split("-").map(Number);
  const [y1, m1] = maxYmd.split("-").map(Number);
  let cur = new Date(y0, m0 - 1, 1);
  const end = new Date(y1, m1 - 1, 1);
  const out: { ymd: string; count: number }[] = [];
  while (cur <= end) {
    const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-01`;
    out.push({
      ymd,
      count: intervals.filter((iv) => iv.start <= ymd && iv.end > ymd).length,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return out;
}
