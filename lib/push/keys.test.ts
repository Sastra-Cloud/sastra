import { describe, expect, it } from "vitest";

import { vapidPublicKeyFromEnv } from "./keys";

describe("vapidPublicKeyFromEnv", () => {
  it("prefers VAPID_PUBLIC_KEY, accepts the older name, and is empty when unset", () => {
    expect(vapidPublicKeyFromEnv({ VAPID_PUBLIC_KEY: "new", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "old" })).toBe("new");
    expect(vapidPublicKeyFromEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: " old " })).toBe("old");
    expect(vapidPublicKeyFromEnv({})).toBe("");
  });
});
