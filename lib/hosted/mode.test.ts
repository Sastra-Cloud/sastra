import { describe, expect, it } from "vitest";

import { hostedAccountUrl, hostedInstanceId, isHostedInstance } from "./mode";

describe("hosted mode", () => {
  it("is self-hosted unless the control plane set an instance id", () => {
    expect(isHostedInstance({})).toBe(false);
    expect(isHostedInstance({ SASTRA_CLOUD_INSTANCE_ID: "  " })).toBe(false);
    expect(hostedInstanceId({ SASTRA_CLOUD_INSTANCE_ID: " ws_1 " })).toBe("ws_1");
    expect(isHostedInstance({ SASTRA_CLOUD_INSTANCE_ID: "ws_1" })).toBe(true);
  });

  it("only offers an account link when one is configured", () => {
    expect(hostedAccountUrl({})).toBeNull();
    expect(hostedAccountUrl({ SASTRA_CLOUD_ACCOUNT_URL: "https://account.example" })).toBe("https://account.example");
  });
});
