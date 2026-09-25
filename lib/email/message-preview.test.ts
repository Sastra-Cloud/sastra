import { describe, expect, it } from "vitest";

import {
  EMAIL_MESSAGE_PREVIEW_LIMIT,
  emailMessagePreviewText,
} from "./message-preview";

describe("emailMessagePreviewText", () => {
  it("keeps the newest reply and removes quoted history", () => {
    expect(
      emailMessagePreviewText({
        subject: "Re: Proof",
        snippet: "Fallback snippet",
        bodyText:
          "The revised proof is ready for review.\n\nOn Tuesday, Stone wrote:\n> Old quoted message",
        bodyHtml: null,
      })
    ).toBe("The revised proof is ready for review.");
  });

  it("uses the provider snippet when there is no readable body", () => {
    expect(
      emailMessagePreviewText({
        subject: "Status",
        snippet: "  The schedule is confirmed.  ",
        bodyText: null,
        bodyHtml: null,
      })
    ).toBe("The schedule is confirmed.");
  });

  it("normalizes whitespace and caps the server-provided excerpt", () => {
    const preview = emailMessagePreviewText({
      subject: "Long update",
      snippet: null,
      bodyText: `First\n\n${"message ".repeat(80)}`,
      bodyHtml: null,
    });

    expect(preview).toHaveLength(EMAIL_MESSAGE_PREVIEW_LIMIT);
    expect(preview).not.toContain("\n");
  });
});
