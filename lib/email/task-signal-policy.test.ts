import { describe, expect, it } from "vitest";

import {
  extractSafeEmailUrls,
  forwardedEmailIsTooOldForTaskSuggestions,
  qualifyingEmailTaskCandidates,
  uniqueDirectEmailRecipient,
} from "./task-signal-policy";

describe("uniqueDirectEmailRecipient", () => {
  const users = [
    { id: "bora", name: "Bora", email: "bora@example.org" },
    { id: "nathan", name: "Nathan", email: "nathan@example.org" },
  ];

  it("assigns an email to the sole active teammate in To", () => {
    expect(
      uniqueDirectEmailRecipient(
        ["capture@example.org", "BORA@example.org"],
        users
      )
    ).toEqual(users[0]);
  });

  it("does not guess when several teammates are direct recipients", () => {
    expect(
      uniqueDirectEmailRecipient(
        ["bora@example.org", "nathan@example.org"],
        users
      )
    ).toBeNull();
  });

  it("does not infer assignment from an address outside To", () => {
    expect(uniqueDirectEmailRecipient(["capture@example.org"], users)).toBeNull();
  });
});

describe("email task signal policy", () => {
  it("skips task extraction only when the forwarded source is over one year old", () => {
    const originalDate = new Date("2025-08-05T12:00:00.000Z");

    expect(
      forwardedEmailIsTooOldForTaskSuggestions({
        originalDate,
        forwardedAt: new Date("2026-08-05T12:00:00.000Z"),
      })
    ).toBe(false);
    expect(
      forwardedEmailIsTooOldForTaskSuggestions({
        originalDate,
        forwardedAt: new Date("2026-08-05T12:00:00.001Z"),
      })
    ).toBe(true);
  });

  it("uses the capture time fallback and keeps messages without a source date", () => {
    expect(
      forwardedEmailIsTooOldForTaskSuggestions({
        originalDate: new Date("2024-01-10T00:00:00.000Z"),
        forwardedAt: null,
        now: new Date("2026-01-10T00:00:00.000Z"),
      })
    ).toBe(true);
    expect(
      forwardedEmailIsTooOldForTaskSuggestions({
        originalDate: null,
        forwardedAt: new Date("2026-08-05T12:00:00.000Z"),
      })
    ).toBe(false);
  });

  it("keeps exact safe links and rejects credentialed or invented links", () => {
    const urls = extractSafeEmailUrls(
      "Book <https://calendar.google.com/example>. Bad https://user:pass@example.org/x"
    );
    expect(urls).toEqual(["https://calendar.google.com/example"]);

    const [candidate] = qualifyingEmailTaskCandidates(
      {
        taskCandidates: [
          {
            actionKind: "schedule_meeting",
            title: "Schedule the call",
            description: "Use Joshua's booking page.",
            dueDate: "",
            priority: "urgent",
            primaryUrl: "https://invented.example/",
            primaryUrlLabel: "Book a time",
            confidence: 0.95,
            reason: "The sender requested a call.",
            explicitIntent: false,
            intentEvidence: "",
          },
        ],
      },
      { allowedUrls: urls, forwarderNote: null }
    );
    expect(candidate.primaryUrl).toBeNull();
    expect(candidate.priority).toBe("medium");
    expect(candidate.mode).toBe("implicit_review");
  });

  it("auto-creates only with exact high-confidence evidence from the trusted note", () => {
    const [candidate] = qualifyingEmailTaskCandidates(
      {
        taskCandidates: [
          {
            actionKind: "schedule_meeting",
            title: "Schedule a call with Joshua",
            description: "Discuss future opportunities.",
            dueDate: "2026-07-24",
            dueDateEvidence: "next Friday",
            priority: "high",
            priorityEvidence: "",
            primaryUrl: "https://calendar.google.com/example",
            primaryUrlLabel: "Book a time",
            confidence: 0.94,
            reason: "Explicit request from the forwarder.",
            explicitIntent: true,
            intentEvidence: "make this a task",
          },
        ],
      },
      {
        allowedUrls: ["https://calendar.google.com/example"],
        forwarderNote: "Please make this a task for next Friday.",
        sourceText: "Please make this a task for next Friday.",
      }
    );
    expect(candidate.mode).toBe("explicit_auto");
    expect(candidate.priority).toBe("medium");
    expect(candidate.dueDate).toBe("2026-07-24");
    expect(candidate.explicitIntentEvidence).toBe("make this a task");
  });

  it("rejects impossible dates and low-confidence candidates", () => {
    const result = qualifyingEmailTaskCandidates(
      {
        taskCandidates: [
          {
            actionKind: "reply",
            title: "Reply",
            dueDate: "2026-02-30",
            confidence: 0.9,
          },
          {
            actionKind: "general",
            title: "Maybe do something",
            confidence: 0.79,
          },
        ],
      },
      { allowedUrls: [], forwarderNote: null }
    );
    expect(result).toHaveLength(1);
    expect(result[0].dueDate).toBeNull();
  });
});
