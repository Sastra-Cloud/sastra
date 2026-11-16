import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.session }));
vi.mock("@/lib/projects/queries", () => ({
  getProjectHeader: async () => ({
    id: "project",
    title: "Book",
    kind: "book",
  }),
}));
vi.mock("./quotation-file", () => ({
  buildAllocatedQuotationBuffer: mocks.build,
  buildPartnerQuotationBuffer: vi.fn(),
  buildQuotationBuffer: vi.fn(),
}));
import { GET } from "@/app/api/projects/[slug]/budget/export/route";
const request = () =>
  new Request(
    "http://localhost:3243/api/projects/book/budget/export?quotation=selected-share&run=reprint",
  );
const context = { params: Promise.resolve({ slug: "book" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.build.mockResolvedValue(Buffer.from("selected share"));
});

it("protects partner quotation downloads from unauthenticated teammates and members", async () => {
  mocks.session.mockResolvedValueOnce(null);
  expect((await GET(request(), context)).status).toBe(401);
  mocks.session.mockResolvedValueOnce({ user: { role: "member" } });
  expect((await GET(request(), context)).status).toBe(403);
  expect(mocks.build).not.toHaveBeenCalled();
});
it("uses the selected project, reprint and share when a manager downloads the quotation", async () => {
  // Roles above manager must pass too; a hand-written list once left out super admins.
  mocks.session.mockResolvedValueOnce({ user: { role: "super_admin" } });
  expect((await GET(request(), context)).status).toBe(200);
  mocks.build.mockClear();
  mocks.session.mockResolvedValue({ user: { role: "manager" } });
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(mocks.build).toHaveBeenCalledWith(
    "project",
    "Book",
    "selected-share",
    "reprint",
    "book",
  );
  expect(await response.text()).toBe("selected share");
});
