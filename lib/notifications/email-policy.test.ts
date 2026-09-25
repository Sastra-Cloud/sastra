import { describe, expect, it } from "vitest";

import {
  categoryEnabled,
  nextBundleBoundary,
  nextDailyDigest,
  notificationEmailCategory,
  notificationEmailDeliveryAt,
  notificationTypeSendsImmediately,
  notificationTypeCanEmail,
  retryDeliveryAt,
} from "./email-policy";

describe("notification email policy", () => {
  it("maps only completed standup digests to the standup email category", () => {
    expect(notificationEmailCategory("standup_digest")).toBe("standup");
    expect(notificationEmailCategory("standup")).toBe("workflow");
    expect(notificationEmailCategory("task_assigned")).toBe("workflow");
    expect(categoryEnabled("standup", { workflowOptIn: true, standupOptIn: false })).toBe(false);
    expect(categoryEnabled("workflow", { workflowOptIn: true, standupOptIn: false })).toBe(true);
  });

  it("keeps every correspondence-intake suggestion out of email", () => {
    expect(notificationTypeCanEmail("email_received")).toBe(false);
    expect(notificationTypeCanEmail("email_task_created")).toBe(false);
    expect(notificationTypeCanEmail("email_task_suggested")).toBe(false);
    expect(notificationTypeCanEmail("possible_new_project")).toBe(false);
    expect(notificationTypeCanEmail("possible_counterparty")).toBe(false);
    expect(notificationTypeCanEmail("possible_grant_reminder")).toBe(false);
    expect(notificationTypeCanEmail("possible_project_update")).toBe(false);
    expect(notificationTypeCanEmail("task_assigned")).toBe(true);
  });

  it("uses the next five-minute boundary, including when already on one", () => {
    expect(nextBundleBoundary(new Date("2026-07-14T10:02:11Z")).toISOString()).toBe(
      "2026-07-14T10:05:00.000Z"
    );
    expect(nextBundleBoundary(new Date("2026-07-14T10:05:00Z")).toISOString()).toBe(
      "2026-07-14T10:10:00.000Z"
    );
  });

  it("defaults daily delivery to the next weekday 08:00 in the profile timezone", () => {
    expect(nextDailyDigest(new Date("2026-07-14T06:00:00Z"), "UTC").toISOString()).toBe(
      "2026-07-14T08:00:00.000Z"
    );
    expect(
      nextDailyDigest(new Date("2026-07-14T14:00:00Z"), "America/Los_Angeles").toISOString()
    ).toBe("2026-07-14T15:00:00.000Z");
  });

  it("rolls weekend work to Monday and follows daylight-saving transitions", () => {
    // Friday after 08:00 PST; the next weekday occurrence is Monday 08:00 PDT.
    expect(
      nextDailyDigest(new Date("2026-03-06T17:00:00Z"), "America/Los_Angeles").toISOString()
    ).toBe("2026-03-09T15:00:00.000Z");
    // Friday after 08:00 PDT; after fall-back Monday is 08:00 PST.
    expect(
      nextDailyDigest(new Date("2026-10-30T17:00:00Z"), "America/Los_Angeles").toISOString()
    ).toBe("2026-11-02T16:00:00.000Z");
  });

  it("reschedules predictably when mode, time, or timezone changes", () => {
    const now = new Date("2026-07-14T14:02:00Z");
    expect(
      notificationEmailDeliveryAt({
        mode: "bundled",
        now,
        timezone: "UTC",
        digestTimeMinutes: 480,
      }).toISOString()
    ).toBe("2026-07-14T14:05:00.000Z");
    expect(
      notificationEmailDeliveryAt({
        mode: "immediate",
        now,
        timezone: "UTC",
        digestTimeMinutes: 480,
      })
    ).toEqual(now);
    expect(
      notificationEmailDeliveryAt({
        mode: "daily",
        now,
        timezone: "America/Los_Angeles",
        digestTimeMinutes: 9 * 60 + 30,
      }).toISOString()
    ).toBe("2026-07-14T16:30:00.000Z");
    expect(
      notificationEmailDeliveryAt({
        mode: "daily",
        now,
        timezone: "America/New_York",
        digestTimeMinutes: 9 * 60 + 30,
      }).toISOString()
    ).toBe("2026-07-15T13:30:00.000Z");
  });

  it("delivers direct mentions immediately without changing email opt-in", () => {
    const now = new Date("2026-07-14T14:02:00Z");
    expect(notificationTypeSendsImmediately("mention")).toBe(true);
    expect(notificationTypeSendsImmediately("task_assigned")).toBe(false);
    expect(
      notificationEmailDeliveryAt({
        mode: "daily",
        now,
        timezone: "America/Los_Angeles",
        digestTimeMinutes: 9 * 60 + 30,
        type: "mention",
      })
    ).toEqual(now);
  });

  it("backs off exponentially and caps retries at six hours", () => {
    const now = new Date("2026-07-14T10:00:00Z");
    expect(retryDeliveryAt(now, 1).toISOString()).toBe("2026-07-14T10:05:00.000Z");
    expect(retryDeliveryAt(now, 4).toISOString()).toBe("2026-07-14T10:40:00.000Z");
    expect(retryDeliveryAt(now, 99).toISOString()).toBe("2026-07-14T16:00:00.000Z");
  });
});
