import { describe, expect, it } from "vitest";

import {
  shouldDeliverPush,
  withinQuietHours,
  type PushPrefs,
} from "@/lib/notifications/push-gate";

const base: PushPrefs = {
  quietHoursEnabled: false,
  quietHoursStart: 1320, // 22:00
  quietHoursEnd: 420, // 07:00
  pushPausedUntil: null,
  pushOnlyWhenActive: false,
  pushReviewSuggestions: false,
};
// 2026-06-23T15:00:00Z → 22:00 in Asia/Phnom_Penh (UTC+7), 15:00 in UTC.
const NOON_UTC = new Date("2026-06-23T12:00:00Z");

describe("withinQuietHours (overnight-aware)", () => {
  it("handles overnight windows", () => {
    expect(withinQuietHours(23 * 60, 1320, 420)).toBe(true); // 23:00 in 22:00–07:00
    expect(withinQuietHours(3 * 60, 1320, 420)).toBe(true); // 03:00
    expect(withinQuietHours(12 * 60, 1320, 420)).toBe(false); // noon
  });
  it("handles same-day windows", () => {
    expect(withinQuietHours(13 * 60, 9 * 60, 17 * 60)).toBe(true);
    expect(withinQuietHours(20 * 60, 9 * 60, 17 * 60)).toBe(false);
  });
});

describe("shouldDeliverPush", () => {
  it("delivers by default", () => {
    expect(shouldDeliverPush(base, "task_assigned", NOON_UTC, "UTC")).toBe(true);
  });
  it("keeps correspondence review suggestions in-app by default", () => {
    expect(
      shouldDeliverPush(base, "possible_counterparty", NOON_UTC, "UTC")
    ).toBe(false);
    expect(
      shouldDeliverPush(
        { ...base, pushReviewSuggestions: true },
        "possible_counterparty",
        NOON_UTC,
        "UTC"
      )
    ).toBe(true);
    expect(
      shouldDeliverPush(base, "possible_project_update", NOON_UTC, "UTC")
    ).toBe(false);
    expect(
      shouldDeliverPush(base, "email_task_suggested", NOON_UTC, "UTC")
    ).toBe(false);
    expect(
      shouldDeliverPush(
        { ...base, pushReviewSuggestions: true },
        "email_task_suggested",
        NOON_UTC,
        "UTC"
      )
    ).toBe(true);
  });
  it("does not couple push to an email category", () => {
    expect(shouldDeliverPush(base, "standup_digest", NOON_UTC, "UTC")).toBe(true);
    expect(shouldDeliverPush(base, "task_assigned", NOON_UTC, "UTC")).toBe(true);
  });
  it("suppresses during a paused (out-of-office) window", () => {
    const until = new Date("2026-06-24T00:00:00Z");
    expect(
      shouldDeliverPush({ ...base, pushPausedUntil: until }, "task_assigned", NOON_UTC, "UTC")
    ).toBe(false);
  });
  it("suppresses during quiet hours in the user's timezone", () => {
    // 12:00 UTC = 19:00 Phnom Penh — outside 22:00–07:00 → delivered
    const p = { ...base, quietHoursEnabled: true };
    expect(shouldDeliverPush(p, "task_assigned", NOON_UTC, "Asia/Phnom_Penh")).toBe(true);
    // 16:00 UTC = 23:00 Phnom Penh — inside 22:00–07:00 → suppressed
    const night = new Date("2026-06-23T16:00:00Z");
    expect(shouldDeliverPush(p, "task_assigned", night, "Asia/Phnom_Penh")).toBe(false);
  });
  it("with active-only push, suppresses when away and delivers when active", () => {
    const p = { ...base, pushOnlyWhenActive: true };
    expect(shouldDeliverPush(p, "task_assigned", NOON_UTC, "UTC", false)).toBe(false);
    expect(shouldDeliverPush(p, "task_assigned", NOON_UTC, "UTC", true)).toBe(true);
    // Off by default → activity is ignored.
    expect(shouldDeliverPush(base, "task_assigned", NOON_UTC, "UTC", false)).toBe(true);
  });
});
