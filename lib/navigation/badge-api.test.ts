import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), counts: vi.fn(), workspace: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.session }));
vi.mock("@/lib/navigation/badge-queries", () => ({ getNavigationBadgeCounts: mocks.counts }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings: mocks.workspace }));
import { GET } from "@/app/api/navigation/badges/route";

beforeEach(() => vi.resetAllMocks());

it.each([null, { user: { id: "inactive", isActive: false } }])("rejects absent or inactive sessions without querying badge data", async (session) => {
  mocks.session.mockResolvedValue(session);
  expect((await GET()).status).toBe(401);
  expect(mocks.counts).not.toHaveBeenCalled();
});

it("uses the session identity and workspace timezone and forbids caching personal counts", async () => {
  const viewer = { id: "member", role: "member", isActive: true };
  const counts = { dueTasks: 1, taskSuggestions: 2, followUps: 0, correspondence: 0, chat: 4, standups: 1 };
  mocks.session.mockResolvedValue({ user: viewer });
  mocks.workspace.mockResolvedValue({ timezone: "Asia/Tokyo" });
  mocks.counts.mockResolvedValue(counts);
  const response = await GET();
  expect(mocks.counts).toHaveBeenCalledWith(viewer, "Asia/Tokyo");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual(counts);
});
