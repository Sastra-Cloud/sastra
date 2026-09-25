import { describe, expect, it } from "vitest";

import { scrubSentryEvent } from "./sentry-scrub";

describe("scrubSentryEvent", () => {
  it("removes request bodies, cookies, unsafe headers, and user PII", () => {
    const event = scrubSentryEvent({
      user: { id: "user-1", email: "admin@example.org", name: "Admin" },
      request: {
        data: { donor: "Private donor", amount: "5000" },
        cookies: { session: "secret" },
        headers: {
          authorization: "Bearer secret",
          cookie: "secret",
          "content-type": "application/json",
          "user-agent": "test",
        },
      },
      extra: { sourceFilename: "donors.csv" },
    });
    expect(event.user).toEqual({ id: "user-1" });
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({
      "content-type": "application/json",
      "user-agent": "test",
    });
    expect(event.extra).toBeUndefined();
  });
});
