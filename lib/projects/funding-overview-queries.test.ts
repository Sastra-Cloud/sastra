import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
import { getProjectFundingOverview } from "./funding-overview-queries";

it("rejects members, including scoped project managers, before retrieving donor or funding records", async () => {
  mocks.auth.mockRejectedValue(new Error("Forbidden"));
  await expect(getProjectFundingOverview("project")).rejects.toThrow("Forbidden");
  expect(mocks.auth).toHaveBeenCalledWith("manager");
  expect(mocks.select).not.toHaveBeenCalled();
});
