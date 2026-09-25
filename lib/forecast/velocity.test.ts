import { describe, expect, it } from "vitest";

import { forecastCompletion, type ForecastSnapshot } from "./velocity";

const today = "2026-07-03";

/** Build a run of daily snapshots ending today, with a steady done-rate. */
function steadySnapshots(days: number, donePerDay: number): ForecastSnapshot[] {
  const out: ForecastSnapshot[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const done = (days - 1 - i) * donePerDay;
    out.push({ snapDate: d, doneTasks: done, totalTasks: 100 });
  }
  return out;
}

describe("forecastCompletion", () => {
  it("returns on_track when the projected date is comfortably before the due date", () => {
    // 2 done/day = 14/week; 14 open → ~1 week out, due far away.
    const f = forecastCompletion({
      snapshots: steadySnapshots(28, 2),
      openTaskCount: 14,
      dueDate: "2026-12-31",
      today,
    });
    expect(f.risk).toBe("on_track");
    expect(f.weeklyVelocity).toBeCloseTo(14, 0);
    expect(f.projectedDate).not.toBeNull();
  });

  it("returns likely_late when the projected date is after the due date", () => {
    // slow pace, lots remaining, near due date
    const f = forecastCompletion({
      snapshots: steadySnapshots(28, 1),
      openTaskCount: 200,
      dueDate: "2026-07-20",
      today,
    });
    expect(f.risk).toBe("likely_late");
  });

  it("flags at_risk when projected finish lands just before the due date", () => {
    // 7/week, 7 open → ~7 days out; due 10 days from today → within slack.
    const f = forecastCompletion({
      snapshots: steadySnapshots(28, 1),
      openTaskCount: 7,
      dueDate: "2026-07-13",
      today,
    });
    expect(f.risk).toBe("at_risk");
  });

  it("returns unknown with too few snapshots", () => {
    const f = forecastCompletion({
      snapshots: [{ snapDate: "2026-07-02", doneTasks: 5, totalTasks: 10 }],
      openTaskCount: 5,
      dueDate: "2026-08-01",
      today,
    });
    expect(f.risk).toBe("unknown");
  });

  it("returns unknown when the snapshot span is under a week", () => {
    const f = forecastCompletion({
      snapshots: [
        { snapDate: "2026-07-01", doneTasks: 2, totalTasks: 10 },
        { snapDate: "2026-07-03", doneTasks: 6, totalTasks: 10 },
      ],
      openTaskCount: 4,
      dueDate: "2026-08-01",
      today,
    });
    expect(f.risk).toBe("unknown");
  });

  it("treats a stalled project with a due date as likely_late", () => {
    // no progress across the window
    const flat = steadySnapshots(28, 0);
    const f = forecastCompletion({
      snapshots: flat,
      openTaskCount: 10,
      dueDate: "2026-08-01",
      today,
    });
    expect(f.risk).toBe("likely_late");
    expect(f.projectedDate).toBeNull();
  });

  it("is on_track when nothing is open", () => {
    const f = forecastCompletion({
      snapshots: steadySnapshots(28, 0),
      openTaskCount: 0,
      dueDate: "2026-08-01",
      today,
    });
    expect(f.risk).toBe("on_track");
  });

  it("returns unknown with a velocity but no due date", () => {
    const f = forecastCompletion({
      snapshots: steadySnapshots(28, 2),
      openTaskCount: 10,
      dueDate: null,
      today,
    });
    expect(f.risk).toBe("unknown");
    expect(f.projectedDate).not.toBeNull();
  });
});
