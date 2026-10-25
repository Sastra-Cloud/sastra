import { describe, expect, it } from "vitest";

import { pushSubscriptionSchema } from "./subscription";

const keys = { p256dh: "dummy-public-key", auth: "dummy-auth-key" };

describe("push destination policy", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/device",
    "https://updates.push.services.mozilla.com/wpush/v2/device",
    "https://web.push.apple.com/device",
    "https://wns2.notify.windows.com/device",
  ])("preserves supported provider destinations: %s", (endpoint) => {
    expect(pushSubscriptionSchema.parse({ endpoint, keys }).endpoint).toBe(endpoint);
  });

  it.each([
    "https://127.0.0.1/internal",
    "https://[::1]/internal",
    "https://169.254.169.254/metadata",
    "https://attacker.example/push",
    "https://fcm.googleapis.com.attacker.example/push",
    "https://notpush.apple.com/push",
    "https://fcm.googleapis.com@attacker.example/push",
    "https://user:password@fcm.googleapis.com/push",
    "https://fcm.googleapis.com:8443/push",
    "http://fcm.googleapis.com/push",
    "not-a-url",
  ])("rejects destinations outside the push-provider boundary: %s", (endpoint) => {
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
  });

  it("passes the canonical URL to the transport", () => {
    expect(pushSubscriptionSchema.parse({
      endpoint: "https://FCM.GOOGLEAPIS.COM:443/fcm/send/device", keys,
    }).endpoint).toBe("https://fcm.googleapis.com/fcm/send/device");
  });
});
