import { beforeEach, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), save: vi.fn(), read: vi.fn(),
  project: { id: "00000000-0000-4000-8000-000000000001" } as { id: string } | null,
  run: null as { id: string; projectId: string } | null,
}));
vi.mock("@/lib/auth/guards", () => ({ getSession: mocks.session }));
vi.mock("./actions", () => ({ saveBudgetPresentation: mocks.save }));
vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  return { db: { select: mocks.read.mockImplementation(() => ({ from: (table: Parameters<typeof getTableName>[0]) => ({
    where: (condition: SQL) => ({ limit: async () => {
      const { params } = new PgDialect().sqlToQuery(condition);
      const candidate = mocks.run;
      const run = candidate && candidate.id === params[0] && (params.length < 2 || candidate.projectId === params[1]) ? candidate : null;
      const row = getTableName(table) === "projects" ? mocks.project : run;
      return row ? [row] : [];
    } }),
  }) })) } };
});
import { PUT } from "@/app/api/projects/[slug]/budget/partner-quote/route";

const input = { printRunId: null, mode: "itemized", deductionPercent: 13, publicDescription: "Audio Book Production" };
const context = { params: Promise.resolve({ slug: "example-book" }) };
function request(body: unknown = input, origin = "http://localhost:3243") {
  return new Request("http://localhost:3243/api/projects/example-book/budget/partner-quote", {
    method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project = { id: "00000000-0000-4000-8000-000000000001" }; mocks.run = null;
  mocks.session.mockResolvedValue({ user: { id: "manager", role: "manager", isActive: true } });
  mocks.save.mockResolvedValue({ ok: true, presentation: { mode: "itemized", deductionBps: 1300, publicDescription: "Audio Book Production", perCopyQuantity: null, perCopyUnitPrice: null } });
});

it("requires an active manager before reading or saving financial settings", async () => {
  mocks.session.mockResolvedValueOnce(null);
  expect((await PUT(request(), context)).status).toBe(401);
  mocks.session.mockResolvedValueOnce({ user: { id: "member", role: "member", isActive: true } });
  expect((await PUT(request(), context)).status).toBe(403);
  mocks.session.mockResolvedValueOnce({ user: { id: "manager", role: "manager", isActive: false } });
  expect((await PUT(request(), context)).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("rejects cross-site writes before accessing the user's session", async () => {
  expect((await PUT(request(input, "https://untrusted.example"), context)).status).toBe(403);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});

it("validates finance fields and rejects a print run outside the project", async () => {
  expect((await PUT(request({ ...input, deductionPercent: 100 }), context)).status).toBe(400);
  mocks.run = { id: "00000000-0000-4000-8000-000000000002", projectId: "another-project" };
  expect((await PUT(request({ ...input, printRunId: "00000000-0000-4000-8000-000000000002" }), context)).status).toBe(400);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("saves the selected project through the shared authorized action and returns its canonical settings", async () => {
  const response = await PUT(request(), context);
  expect(response.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(mocks.project!.id, input);
  expect(await response.json()).toMatchObject({ ok: true, presentation: { publicDescription: "Audio Book Production", deductionBps: 1300 } });
});
