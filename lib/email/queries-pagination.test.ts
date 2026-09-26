import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), rows: [] as { id: string }[], limit: vi.fn(), offset: vi.fn(), where: vi.fn(), orderBy: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
import { listThreads, listThreadsPage } from "./queries";

describe("correspondence page query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRole.mockResolvedValue({});
    const query = { from: () => query, leftJoin: () => query, innerJoin: () => query, $dynamic: () => query, where: mocks.where, orderBy: mocks.orderBy, limit: mocks.limit, offset: mocks.offset };
    mocks.select.mockReturnValue(query);
    mocks.where.mockReturnValue(query); mocks.orderBy.mockReturnValue(query); mocks.limit.mockReturnValue(query);
    mocks.offset.mockImplementation(() => Promise.resolve(mocks.rows));
    mocks.rows = [];
  });
  it("returns 50 items and probes one extra with a stable order", async () => {
    mocks.rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i) }));
    const result = await listThreadsPage({ page: 3, status: "waiting" });
    expect(result.items).toHaveLength(50); expect(result.hasMore).toBe(true);
    expect(mocks.limit).toHaveBeenCalledWith(51); expect(mocks.offset).toHaveBeenCalledWith(100);
    const dialect = new PgDialect();
    expect(mocks.orderBy.mock.calls[0].map(value => dialect.sqlToQuery(value).sql).join(",")).toMatch(/last_message_at.*desc nulls last.*id.*desc/);
    expect(mocks.requireRole).toHaveBeenCalledWith("manager");
  });
  it("keeps the original list API and detects the last page", async () => {
    mocks.rows = [{ id: "one" }];
    expect(await listThreads({ limit: 3 })).toEqual(mocks.rows);
    expect(mocks.limit).toHaveBeenCalledWith(3);
    expect(await listThreadsPage({ page: NaN })).toEqual({ items: mocks.rows, hasMore: false });
    expect(mocks.offset).toHaveBeenLastCalledWith(0);
  });
  it("searches subject and linked project with escaped literal wildcards", async () => {
    await listThreadsPage({ search: "  50%_complete  ", status: "open", projectRelated: true });
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(query.sql).toContain('"email_threads"."subject" ilike');
    expect(query.sql).toContain("linked_project.title ilike");
    expect(query.params.filter(value => value === "%50\\%\\_complete%")).toHaveLength(3);
    expect(query.params).toContain("open");
  });
  it("rejects members before reading any correspondence", async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(listThreadsPage()).rejects.toThrow("Forbidden");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
