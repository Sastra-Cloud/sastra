import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getEntitlement } from "@/lib/hosted/entitlements";
import { assertLectioCloudEligibility } from "./cloud-eligibility";
vi.mock("@/lib/hosted/entitlements", () => ({ getEntitlement: vi.fn() }));
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("BETTER_AUTH_URL", "https://team.example.com");
  vi.stubEnv("SASTRA_CLOUD_INSTANCE_ID", "inst-1"); vi.mocked(getEntitlement).mockReset();
  vi.stubEnv("SASTRA_LECTIO_MANAGED_INSTANCE_ID", ""); vi.stubEnv("SASTRA_LECTIO_MANAGED_ORIGIN", "");
});
it("identifies an explicitly configured managed deployment without altering hosted billing mode", async () => {
  vi.stubEnv("SASTRA_CLOUD_INSTANCE_ID", "");
  vi.stubEnv("SASTRA_LECTIO_MANAGED_INSTANCE_ID", "operator-instance-1");
  vi.stubEnv("SASTRA_LECTIO_MANAGED_ORIGIN", "https://team.example.com");
  expect(await assertLectioCloudEligibility()).toBe("operator-instance-1");
  expect(getEntitlement).not.toHaveBeenCalled();
  vi.stubEnv("BETTER_AUTH_URL", "https://other.example.com");
  await expect(assertLectioCloudEligibility()).rejects.toMatchObject({ status: 403 });
});
afterEach(() => vi.unstubAllEnvs());
it("requires a matching paid hosted entitlement locally", async () => {
  vi.mocked(getEntitlement).mockResolvedValue({ instanceId: "inst-1", billingState: "active" } as never);
  expect(await assertLectioCloudEligibility()).toBe("inst-1");
  vi.mocked(getEntitlement).mockResolvedValue({ instanceId: "inst-1", billingState: "trialing" } as never);
  await expect(assertLectioCloudEligibility()).rejects.toMatchObject({ status: 403 });
  vi.mocked(getEntitlement).mockResolvedValue({ instanceId: "another-instance", billingState: "active" } as never);
  await expect(assertLectioCloudEligibility()).rejects.toMatchObject({ status: 403 });
});
it("does not permit self-hosted or production instances to use the development exception", async () => {
  vi.stubEnv("SASTRA_CLOUD_INSTANCE_ID", ""); vi.stubEnv("SASTRA_LECTIO_DEV_INSTANCE_ID", "dev-fixture");
  await expect(assertLectioCloudEligibility()).rejects.toMatchObject({ status: 403 });
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3243");
  vi.stubEnv("TRANSLATION_INTEGRATION_DEV_ORIGINS", "http://localhost:3243");
  expect(await assertLectioCloudEligibility()).toBe("dev-fixture");
  vi.stubEnv("NODE_ENV", "production");
  await expect(assertLectioCloudEligibility()).rejects.toThrow();
});
