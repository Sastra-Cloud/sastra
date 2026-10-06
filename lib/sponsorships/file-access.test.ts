import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ limit: vi.fn(), workspace: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ leftJoin: () => ({ where: () => ({ limit: mocks.limit }) }) }) }) } }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: mocks.workspace }));
import { canAccessFile } from "@/lib/chat/access";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({ enabledModules: ["sponsorships"] });
});
describe("sponsorship PDF authorization", () => {
  for (const role of ["member", "unknown", null]) {
    it(`denies ${role ?? "missing"} roles even for their own uploaded invoice`, async () => {
      mocks.limit.mockResolvedValue([{ purpose: "sponsorship_invoice", role, isActive: true, uploadedBy: "user" }]);
      expect(await canAccessFile("file", "user")).toBe(false);
    });
  }
  for (const role of ["manager", "admin", "super_admin"]) {
    it(`allows active ${role} users to review another manager's invoice`, async () => {
      mocks.limit.mockResolvedValue([{ purpose: "sponsorship_invoice", role, isActive: true, uploadedBy: "other" }]);
      expect(await canAccessFile("file", "user")).toBe(true);
    });
  }
  it("denies direct file URLs when the module is disabled", async () => {
    mocks.workspace.mockResolvedValue({ enabledModules: [] });
    mocks.limit.mockResolvedValue([{ purpose: "sponsorship_invoice", role: "super_admin", isActive: true, uploadedBy: "user" }]);
    expect(await canAccessFile("file", "user")).toBe(false);
  });
  it("denies inactive managers", async () => {
    mocks.limit.mockResolvedValue([{ purpose: "sponsorship_invoice", role: "manager", isActive: false, uploadedBy: "user" }]);
    expect(await canAccessFile("file", "user")).toBe(false);
  });
});
