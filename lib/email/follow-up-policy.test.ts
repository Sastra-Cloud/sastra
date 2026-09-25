import { describe, expect, it } from "vitest";

import {
  addBusinessDaysInTimeZone,
  externalRecipient,
  fallbackFollowUpSummary,
  latestReplyText,
} from "./follow-up-policy";

describe("external email follow-up policy", () => {
  it("keeps only the newest reply above quoted history", () => {
    expect(
      latestReplyText(
        "Any update on the proof?\n\nOn Fri, Jul 10, 2026 at 2:58 PM Bora wrote:\n> Older request"
      )
    ).toBe("Any update on the proof?");
  });

  it("builds a safe subject fallback", () => {
    expect(fallbackFollowUpSummary("Re: Re: Discipling")).toBe(
      "Waiting for a response about Discipling."
    );
  });

  it("selects the first external recipient", () => {
    expect(
      externalRecipient(
        ["projects@example.org", "stone@relianceprinting.com"],
        ["example.org"]
      )
    ).toBe("stone@relianceprinting.com");
  });

  it("advances over workspace weekends in local time", () => {
    const result = addBusinessDaysInTimeZone({
      from: new Date("2026-07-17T22:00:00.000Z"), // Friday 15:00 in Los Angeles
      businessDays: 3,
      workDays: [1, 2, 3, 4, 5],
      timeZone: "America/Los_Angeles",
    });
    expect(result.toISOString()).toBe("2026-07-22T22:00:00.000Z");
  });
});
