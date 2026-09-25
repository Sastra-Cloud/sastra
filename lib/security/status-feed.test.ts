import { describe, expect, it } from "vitest";

import {
  DEFAULT_SECURITY_STATUS_URL,
  parseSecurityStatusFeed,
  securityStatusFeedUrl,
  securityStatusRefFor,
  selectSecurityStatus,
} from "./status-feed";

const feed = parseSecurityStatusFeed({
  schemaVersion: 1,
  checkedAt: "2026-09-25T11:23:00Z",
  refs: {
    main: { status: "passed", checkedAt: "2026-09-25T11:23:00Z", commit: "abc" },
    "v0.1.0": { status: "failed", checkedAt: "2026-09-25T11:24:00Z" },
    broken: { status: "maybe", checkedAt: "nope" },
  },
  latestRelease: "v0.1.0",
})!;

describe("security status feed", () => {
  it("defaults to the public feed, honors an override, and can be switched off", () => {
    expect(securityStatusFeedUrl({})).toBe(DEFAULT_SECURITY_STATUS_URL);
    expect(securityStatusFeedUrl({ SECURITY_STATUS_URL: "https://example.org/s.json" })).toBe(
      "https://example.org/s.json"
    );
    expect(securityStatusFeedUrl({ SECURITY_STATUS_URL: "off" })).toBeNull();
  });

  it("keeps only well-formed entries", () => {
    expect(Object.keys(feed.refs).sort()).toEqual(["main", "v0.1.0"]);
    expect(parseSecurityStatusFeed({ schemaVersion: 2, refs: {} })).toBeNull();
    expect(parseSecurityStatusFeed("nope")).toBeNull();
  });

  it("reads the entry for the running release, or main for untagged builds", () => {
    expect(securityStatusRefFor({ version: "v0.1.0", taggedRelease: true })).toBe("v0.1.0");
    expect(securityStatusRefFor({ version: "0.1.0", taggedRelease: false })).toBe("main");
    expect(selectSecurityStatus(feed, { version: "0.1.0", taggedRelease: true })).toMatchObject({
      status: "failed",
      ref: "v0.1.0",
    });
    expect(selectSecurityStatus(feed, { version: "0.1.0", taggedRelease: false })?.status).toBe("passed");
    expect(selectSecurityStatus(feed, { version: "9.9.9", taggedRelease: true })).toBeNull();
  });
});
