import { describe, expect, it } from "vitest";

import { derivePushSetupState, type PushSetupInput } from "./setup-state";

// A resolved Android-Chrome-in-a-tab baseline: supported, not iOS, permission
// prompt not yet answered, no existing subscription.
const base: PushSetupInput = {
  supported: true,
  ios: false,
  standalone: false,
  permission: "default",
  hasEndpoint: false,
};

describe("derivePushSetupState", () => {
  it("returns detecting while async signals are unresolved", () => {
    expect(derivePushSetupState({ ...base, supported: null })).toBe("detecting");
    expect(derivePushSetupState({ ...base, hasEndpoint: null })).toBe("detecting");
  });

  it("returns enabled when a local subscription exists (regardless of platform)", () => {
    expect(derivePushSetupState({ ...base, hasEndpoint: true })).toBe("enabled");
    // An existing sub wins even on an iOS tab or with a stale 'denied' read.
    expect(
      derivePushSetupState({ ...base, hasEndpoint: true, ios: true, standalone: false })
    ).toBe("enabled");
    expect(
      derivePushSetupState({ ...base, hasEndpoint: true, permission: "denied" })
    ).toBe("enabled");
  });

  it("sends iOS browser tabs to the install walkthrough", () => {
    expect(
      derivePushSetupState({ ...base, ios: true, standalone: false, supported: false })
    ).toBe("ios-needs-install");
  });

  it("treats iOS standalone without Push API as unsupported (old iOS)", () => {
    expect(
      derivePushSetupState({ ...base, ios: true, standalone: true, supported: false })
    ).toBe("unsupported");
  });

  it("returns unsupported for a desktop/Android browser without Push API", () => {
    expect(derivePushSetupState({ ...base, supported: false })).toBe("unsupported");
  });

  it("returns denied when permission is blocked", () => {
    expect(derivePushSetupState({ ...base, permission: "denied" })).toBe("denied");
  });

  it("returns ready for permission default or granted-without-subscription", () => {
    expect(derivePushSetupState({ ...base, permission: "default" })).toBe("ready");
    expect(derivePushSetupState({ ...base, permission: "granted" })).toBe("ready");
    // iOS standalone with Push API and no sub yet is also ready.
    expect(
      derivePushSetupState({ ...base, ios: true, standalone: true, permission: "default" })
    ).toBe("ready");
  });

  it("ignores a null permission (API absent) as long as push is supported", () => {
    // Defensive: if supported is true but permission couldn't be read, fall
    // through to ready rather than denied.
    expect(derivePushSetupState({ ...base, permission: null })).toBe("ready");
  });
});
