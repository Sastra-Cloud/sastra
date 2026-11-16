import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), tasks: vi.fn(), insert: vi.fn(), select: vi.fn(), remove: vi.fn(), returning: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireUser: mocks.auth }));
vi.mock("./queries", () => ({ getMyTasks: mocks.tasks }));
vi.mock("@/lib/db", () => ({ db: { insert: mocks.insert, select: mocks.select, delete: mocks.remove } }));
import { getTaskPinSnapshot, setTaskPinned } from "./pin-actions";

const taskId = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "viewer" } });
  mocks.returning.mockResolvedValue([{ id: taskId }]);
  mocks.insert.mockReturnValue({ select: () => ({ onConflictDoUpdate: () => ({ returning: mocks.returning }) }) });
});

it("requires an authenticated user for both reads and pin writes before accessing data", async () => {
  mocks.auth.mockRejectedValue(new Error("Sign in"));
  await expect(getTaskPinSnapshot()).rejects.toThrow("Sign in");
  await expect(setTaskPinned(taskId, true)).rejects.toThrow("Sign in");
  expect(mocks.tasks).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
});

// Query-boundary coverage: verifies the viewer predicates sent to the database.
// Browser/integration verification covers execution against PostgreSQL.
it("scopes the snapshot and unpin operation to the signed-in viewer", async () => {
  let readParams: unknown[] = [], deleteParams: unknown[] = [];
  mocks.tasks.mockResolvedValue([]);
  mocks.select.mockReturnValue({ from: () => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    readParams = new PgDialect().sqlToQuery(condition).params;
    return { orderBy: async () => [{ taskId }] };
  } }) });
  mocks.remove.mockReturnValue({ where: async (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => { deleteParams = new PgDialect().sqlToQuery(condition).params; } });
  expect(await getTaskPinSnapshot()).toEqual({ tasks: [], pinnedIds: [taskId] });
  expect(mocks.tasks).toHaveBeenCalledWith("viewer");
  expect(readParams).toEqual(["viewer"]);
  await setTaskPinned(taskId, false);
  expect(deleteParams).toEqual(["viewer", taskId]);
});

it("restricts atomic pin insertion to the viewer's unfinished tasks and rejects an ineligible task", async () => {
  const queryDb = drizzle.mock();
  mocks.select.mockImplementation((...args: Parameters<typeof queryDb.select>) => queryDb.select(...args));
  let query: { sql: string; params: unknown[] } | undefined;
  mocks.insert.mockReturnValue({ select: (selection: { toSQL: () => { sql: string; params: unknown[] } }) => {
    query = selection.toSQL();
    return { onConflictDoUpdate: () => ({ returning: mocks.returning }) };
  } });
  await setTaskPinned(taskId, true);
  expect(query?.params).toEqual(["viewer", taskId, "viewer", "done"]);
  expect(query?.sql).toContain('"tasks"."assigned_to" =');
  expect(query?.sql).toContain('"tasks"."status" <>');
  mocks.returning.mockResolvedValue([]);
  await expect(setTaskPinned(taskId, true)).rejects.toThrow("Only unfinished tasks assigned to you");
});
