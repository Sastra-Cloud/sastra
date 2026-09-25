import { describe, expect, it } from "vitest";

import { withinQuietHours } from "./push-gate";
import { workToQuietWindow } from "./work-hours";

describe("workToQuietWindow", () => {
  it("turns a work window into its complement quiet window", () => {
    // Cambodia work hours 08:00–16:00 → quiet 16:00–08:00 (overnight).
    expect(workToQuietWindow(480, 960)).toEqual({
      quietStart: 960,
      quietEnd: 480,
    });
  });

  it("allows push during work hours and silences outside them", () => {
    const { quietStart, quietEnd } = workToQuietWindow(480, 960); // 08:00–16:00
    // 10:00 is within work → NOT quiet → deliver.
    expect(withinQuietHours(600, quietStart, quietEnd)).toBe(false);
    // 20:00 is outside work → quiet → suppress.
    expect(withinQuietHours(1200, quietStart, quietEnd)).toBe(true);
    // 07:00, before work starts → quiet → suppress.
    expect(withinQuietHours(420, quietStart, quietEnd)).toBe(true);
    // Exactly 16:00 (work end, exclusive) → quiet.
    expect(withinQuietHours(960, quietStart, quietEnd)).toBe(true);
    // Exactly 08:00 (work start) → not quiet.
    expect(withinQuietHours(480, quietStart, quietEnd)).toBe(false);
  });
});
