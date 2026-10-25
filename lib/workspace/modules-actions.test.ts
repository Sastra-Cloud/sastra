import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eligibility: vi.fn(),
  requireRole: vi.fn(),
  update: vi.fn(),
  logActivity: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/db", () => ({ db: { update: mocks.update } }));
vi.mock("@/lib/r2", () => ({ deleteObject: vi.fn() }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: mocks.logActivity }));
vi.mock("@/lib/hosted/tick-request", () => ({ requestScheduledTick: vi.fn() }));
vi.mock("@/lib/lectio/cloud-eligibility", () => ({ assertLectioCloudEligibility: mocks.eligibility }));

import { setWorkspaceModule } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ user: { id: "admin" } });
  mocks.eligibility.mockRejectedValue(new Error("Cloud subscription required"));
  mocks.update.mockReturnValue({
    set: () => ({ where: () => ({ returning: async () => [{ enabledModules: ["lectio"] }] }) }),
  });
});

it("rejects a direct Lectio activation before any write when Cloud eligibility is missing", async () => {
  expect(await setWorkspaceModule({ module: "lectio", enabled: true })).toMatchObject({ error: expect.any(String) });
  expect(mocks.requireRole).toHaveBeenCalledWith("admin");
  expect(mocks.eligibility).toHaveBeenCalledOnce();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.logActivity).not.toHaveBeenCalled();
});

it("preserves Lectio activation for an eligible paid Cloud workspace", async () => {
  mocks.eligibility.mockResolvedValue("cloud-instance");
  expect(await setWorkspaceModule({ module: "lectio", enabled: true })).not.toHaveProperty("error");
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.logActivity).toHaveBeenCalledOnce();
});

it("allows deactivation and other modules when Cloud eligibility is unavailable", async () => {
  expect(await setWorkspaceModule({ module: "lectio", enabled: false })).not.toHaveProperty("error");
  expect(await setWorkspaceModule({ module: "sponsorships", enabled: true })).not.toHaveProperty("error");
  expect(mocks.eligibility).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledTimes(2);
});
