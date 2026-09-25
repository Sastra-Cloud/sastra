import { describe, expect, it } from "vitest";

import { derivePresence } from "./status";

const NOW = new Date("2026-06-28T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("derivePresence", () => {
  it("is online with a recent visible heartbeat", () => {
    expect(
      derivePresence(
        { lastActiveAt: ago(10_000), lastHiddenAt: null, manualStatus: "auto" },
        NOW
      )
    ).toBe("online");
  });

  it("is away when the tab was hidden more recently than active", () => {
    expect(
      derivePresence(
        { lastActiveAt: ago(40_000), lastHiddenAt: ago(5_000), manualStatus: "auto" },
        NOW
      )
    ).toBe("away");
  });

  it("is away when activity is stale but within the away window", () => {
    expect(
      derivePresence(
        { lastActiveAt: ago(120_000), lastHiddenAt: null, manualStatus: "auto" },
        NOW
      )
    ).toBe("away");
  });

  it("is offline once activity passes the away window", () => {
    expect(
      derivePresence(
        { lastActiveAt: ago(10 * 60_000), lastHiddenAt: null, manualStatus: "auto" },
        NOW
      )
    ).toBe("offline");
  });

  it("is offline with no activity recorded", () => {
    expect(
      derivePresence(
        { lastActiveAt: null, lastHiddenAt: null, manualStatus: "auto" },
        NOW
      )
    ).toBe("offline");
  });

  it("honors manual overrides regardless of activity", () => {
    expect(
      derivePresence(
        { lastActiveAt: ago(1_000), lastHiddenAt: null, manualStatus: "away" },
        NOW
      )
    ).toBe("away");
    expect(
      derivePresence(
        { lastActiveAt: ago(1_000), lastHiddenAt: null, manualStatus: "offline" },
        NOW
      )
    ).toBe("offline");
  });
});
