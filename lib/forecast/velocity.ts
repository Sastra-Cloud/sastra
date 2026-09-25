/**
 * Velocity-based completion forecast. Pure (no DB) so it's unit-testable — the
 * engine/queries wrap it with I/O. Projects a completion date from recent
 * done-task velocity and compares it to the project's due date to flag schedule
 * risk. Deliberately conservative: too little history → "unknown" (rendered
 * neutrally), and the derived schedule blocker is warning-only.
 */

export type ForecastRisk = "on_track" | "at_risk" | "likely_late" | "unknown";

export type ProjectForecast = {
  /** Done tasks per week over the recent window (0 if unknown/stalled). */
  weeklyVelocity: number;
  /** yyyy-mm-dd projected completion, or null when it can't be projected. */
  projectedDate: string | null;
  risk: ForecastRisk;
};

export type ForecastSnapshot = {
  snapDate: string; // yyyy-mm-dd
  doneTasks: number;
  totalTasks: number;
};

const WINDOW_DAYS = 28;
const MIN_SPAN_DAYS = 7;
const AT_RISK_SLACK_DAYS = 7;

function parseYmd(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function addDays(iso: string, days: number): string {
  const ms = parseYmd(iso) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function dayDiff(fromIso: string, toIso: string): number {
  return Math.round((parseYmd(toIso) - parseYmd(fromIso)) / 86_400_000);
}

export function forecastCompletion(input: {
  snapshots: ForecastSnapshot[];
  openTaskCount: number;
  dueDate: string | null;
  today: string;
}): ProjectForecast {
  const unknown: ProjectForecast = {
    weeklyVelocity: 0,
    projectedDate: null,
    risk: "unknown",
  };

  // Nothing left to do → effectively finished, on track.
  if (input.openTaskCount <= 0) {
    return { weeklyVelocity: 0, projectedDate: input.today, risk: "on_track" };
  }

  // Snapshots inside the recent window, oldest first.
  const cutoff = addDays(input.today, -WINDOW_DAYS);
  const recent = input.snapshots
    .filter((s) => s.snapDate >= cutoff && s.snapDate <= input.today)
    .sort((a, b) => a.snapDate.localeCompare(b.snapDate));
  if (recent.length < 2) return unknown;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const spanDays = dayDiff(first.snapDate, last.snapDate);
  if (spanDays < MIN_SPAN_DAYS) return unknown;

  const doneDelta = last.doneTasks - first.doneTasks;
  const weeklyVelocity = (doneDelta / spanDays) * 7;

  // Stalled (no forward progress) with work remaining: late if there's a
  // deadline, otherwise not enough signal to say.
  if (weeklyVelocity <= 0) {
    return {
      weeklyVelocity: 0,
      projectedDate: null,
      risk: input.dueDate ? "likely_late" : "unknown",
    };
  }

  const weeksNeeded = input.openTaskCount / weeklyVelocity;
  const projectedDate = addDays(input.today, Math.ceil(weeksNeeded * 7));

  if (!input.dueDate) {
    return { weeklyVelocity, projectedDate, risk: "unknown" };
  }

  const slack = dayDiff(projectedDate, input.dueDate); // due − projected
  let risk: ForecastRisk;
  if (slack < 0) risk = "likely_late";
  else if (slack <= AT_RISK_SLACK_DAYS) risk = "at_risk";
  else risk = "on_track";
  return { weeklyVelocity, projectedDate, risk };
}
