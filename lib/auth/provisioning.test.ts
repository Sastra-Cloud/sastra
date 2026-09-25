import { afterEach, describe, expect, it } from "vitest";

import {
  createProvisioningGrant,
  isInitialAdminBootstrapEnabled,
  verifyProvisioningGrant,
} from "./provisioning";

const originalSecret = process.env.AUTH_PROVISIONING_SECRET;
const originalBootstrapEnabled = process.env.ENABLE_INITIAL_ADMIN_BOOTSTRAP;

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env.AUTH_PROVISIONING_SECRET;
  } else {
    process.env.AUTH_PROVISIONING_SECRET = originalSecret;
  }
  if (originalBootstrapEnabled === undefined) {
    delete process.env.ENABLE_INITIAL_ADMIN_BOOTSTRAP;
  } else {
    process.env.ENABLE_INITIAL_ADMIN_BOOTSTRAP = originalBootstrapEnabled;
  }
});

describe("provisioning grants", () => {
  it("binds a short-lived signed grant to its normalized email", () => {
    process.env.AUTH_PROVISIONING_SECRET = "test-only-provisioning-secret";
    const grant = createProvisioningGrant("Invited@Example.org", "invite");
    expect(verifyProvisioningGrant(grant, "invited@example.org")).toMatchObject({
      email: "invited@example.org",
      purpose: "invite",
    });
    expect(verifyProvisioningGrant(grant, "attacker@example.org")).toBeNull();
  });

  it("rejects a modified signature", () => {
    process.env.AUTH_PROVISIONING_SECRET = "test-only-provisioning-secret";
    const grant = createProvisioningGrant("invited@example.org", "invite");
    expect(
      verifyProvisioningGrant(`${grant.slice(0, -1)}x`, "invited@example.org")
    ).toBeNull();
  });

  it("keeps initial-admin bootstrap off unless explicitly enabled", () => {
    delete process.env.ENABLE_INITIAL_ADMIN_BOOTSTRAP;
    expect(isInitialAdminBootstrapEnabled()).toBe(false);
    process.env.ENABLE_INITIAL_ADMIN_BOOTSTRAP = "false";
    expect(isInitialAdminBootstrapEnabled()).toBe(false);
    process.env.ENABLE_INITIAL_ADMIN_BOOTSTRAP = "true";
    expect(isInitialAdminBootstrapEnabled()).toBe(true);
  });
});
