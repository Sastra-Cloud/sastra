import { describe, expect, it } from "vitest";

import {
  dailyDue,
  earliest,
  intervalDue,
  isInWeeklyWindow,
  isWithinWorkHours,
  nextLocalOccurrence,
  nextWeeklyWindow,
  nextWorkHoursStart,
  pollingDue,
  type WorkSchedule,
} from "./schedule";

// Asia/Phnom_Penh is UTC+7 all year, which keeps the expectations readable.
const TZ = "Asia/Phnom_Penh";
const schedule: WorkSchedule = {
  timezone: TZ,
  workDays: [1, 2, 3, 4, 5],
  workHoursStart: 8 * 60,
  workHoursEnd: 16 * 60,
};

/** Local Phnom Penh wall-clock → UTC instant. */
function local(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

describe("intervalDue", () => {
  it("is due now when the job never ran", () => {
    const now = local("2026-09-24T10:00:00");
    expect(intervalDue(now, null, 60_000)).toEqual(now);
  });

  it("is due one interval after the last run, never in the past", () => {
    const now = local("2026-09-24T10:00:00");
    expect(intervalDue(now, local("2026-09-24T09:58:00"), 5 * 60_000)).toEqual(
      local("2026-09-24T10:03:00")
    );
    expect(intervalDue(now, local("2026-09-24T09:00:00"), 5 * 60_000)).toEqual(now);
  });
});

describe("work hours", () => {
  it("recognizes a weekday inside the window", () => {
    expect(isWithinWorkHours(local("2026-09-24T09:00:00"), schedule)).toBe(true); // Thu
    expect(isWithinWorkHours(local("2026-09-24T16:00:00"), schedule)).toBe(false);
    expect(isWithinWorkHours(local("2026-09-26T09:00:00"), schedule)).toBe(false); // Sat
  });

  it("finds the next work-hours start across a weekend", () => {
    const fridayNight = local("2026-09-25T20:00:00");
    expect(nextWorkHoursStart(fridayNight, schedule)).toEqual(
      local("2026-09-28T08:00:00")
    );
    const midMorning = local("2026-09-24T09:30:00");
    expect(nextWorkHoursStart(midMorning, schedule)).toEqual(midMorning);
  });
});

describe("pollingDue", () => {
  it("polls every 5 minutes during work hours", () => {
    const now = local("2026-09-24T10:00:00");
    expect(
      pollingDue(now, local("2026-09-24T09:58:00"), schedule, 5 * 60_000, 60 * 60_000)
    ).toEqual(local("2026-09-24T10:03:00"));
  });

  it("slows to the idle interval at night but wakes for the morning", () => {
    const night = local("2026-09-24T22:00:00");
    expect(
      pollingDue(night, local("2026-09-24T21:50:00"), schedule, 5 * 60_000, 60 * 60_000)
    ).toEqual(local("2026-09-24T22:50:00"));

    const dawn = local("2026-09-25T07:30:00");
    expect(
      pollingDue(dawn, local("2026-09-25T07:20:00"), schedule, 5 * 60_000, 60 * 60_000)
    ).toEqual(local("2026-09-25T08:00:00"));
  });
});

describe("nextLocalOccurrence", () => {
  it("returns today's time when it is still ahead, otherwise tomorrow's", () => {
    expect(nextLocalOccurrence(local("2026-09-24T02:00:00"), TZ, "03:00")).toEqual(
      local("2026-09-24T03:00:00")
    );
    expect(nextLocalOccurrence(local("2026-09-24T03:00:00"), TZ, "03:00")).toEqual(
      local("2026-09-25T03:00:00")
    );
  });

  it("respects the allowed weekdays", () => {
    // Thursday → next Monday 09:00
    expect(
      nextLocalOccurrence(local("2026-09-24T12:00:00"), TZ, "09:00", [1])
    ).toEqual(local("2026-09-28T09:00:00"));
  });

  it("handles daylight saving transitions by walking calendar days", () => {
    // Europe/Berlin leaves DST on 2026-10-25; 03:00 local still lands on the
    // correct instant the day after.
    const after = new Date("2026-10-24T02:00:00+02:00");
    const next = nextLocalOccurrence(after, "Europe/Berlin", "03:00");
    expect(next.toISOString()).toBe("2026-10-24T01:00:00.000Z");
    const following = nextLocalOccurrence(next, "Europe/Berlin", "03:00");
    expect(following.toISOString()).toBe("2026-10-25T02:00:00.000Z");
  });
});

describe("dailyDue", () => {
  it("anchors to the next local time after the last run", () => {
    const now = local("2026-09-24T10:00:00");
    expect(dailyDue(now, local("2026-09-24T06:00:30"), TZ, "06:00")).toEqual(
      local("2026-09-25T06:00:00")
    );
  });

  it("catches up immediately when a run was missed", () => {
    const now = local("2026-09-26T10:00:00");
    expect(dailyDue(now, local("2026-09-24T06:00:30"), TZ, "06:00")).toEqual(now);
  });
});

describe("weekly window", () => {
  it("computes the next Monday 09:00 window and recognizes being inside it", () => {
    const thursday = local("2026-09-24T12:00:00");
    expect(nextWeeklyWindow(thursday, TZ, 1, "09:00")).toEqual(
      local("2026-09-28T09:00:00")
    );
    expect(isInWeeklyWindow(local("2026-09-28T09:40:00"), TZ, 1, "09:00")).toBe(true);
    expect(isInWeeklyWindow(local("2026-09-28T10:00:00"), TZ, 1, "09:00")).toBe(false);
  });
});

describe("earliest", () => {
  it("ignores nulls and returns the minimum", () => {
    const a = local("2026-09-24T10:00:00");
    const b = local("2026-09-24T09:00:00");
    expect(earliest(null, a, undefined, b)).toEqual(b);
    expect(earliest(null, undefined)).toBeNull();
  });
});
