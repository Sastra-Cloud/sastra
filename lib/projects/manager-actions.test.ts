import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  requireRole: vi.fn(), insert: vi.fn(), values: vi.fn(), remove: vi.fn(), where: vi.fn(),
  selected: [] as unknown[][], select: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: state.requireRole }));
vi.mock("@/lib/db", () => ({ db: { select: state.select, insert: state.insert, delete: state.remove } }));
import { addProjectManager, removeProjectManager } from "./manager-actions";

const projectId = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  state.requireRole.mockResolvedValue({ user: { id: "global-manager" } });
  state.selected = [[{ id: "member", name: "Member", image: null }], [{ slug: "project" }]];
  state.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => state.selected.shift() ?? [] }) }) }));
  state.insert.mockReturnValue({ values: state.values });
  state.values.mockReturnValue({ onConflictDoNothing: () => ({ returning: async () => [{ id: "grant" }] }) });
  state.remove.mockReturnValue({ where: state.where });
  state.where.mockReturnValue({ returning: async () => [{ id: "grant" }] });
});

describe("project management delegation", () => {
  it("requires workspace manager authority for both grant and revoke before any database access", async () => {
    state.requireRole.mockRejectedValue(new Error("Workspace manager required"));
    await expect(addProjectManager(projectId, "member")).rejects.toThrow("Workspace manager required");
    await expect(removeProjectManager(projectId, "member")).rejects.toThrow("Workspace manager required");
    expect(state.requireRole).toHaveBeenCalledWith("manager");
    expect(state.select).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("saves the explicit project and teammate grant and returns canonical display data", async () => {
    await expect(addProjectManager(projectId, "member")).resolves.toEqual({ userId: "member", name: "Member", image: null });
    expect(state.values).toHaveBeenCalledWith({ projectId, userId: "member", grantedBy: "global-manager" });
    await removeProjectManager(projectId, "member");
    expect(new PgDialect().sqlToQuery(state.where.mock.calls[0][0]).params).toEqual([projectId, "member"]);
  });

  it("rejects ineligible teammates and surfaces failed writes for client rollback", async () => {
    state.selected = [[]];
    await expect(addProjectManager(projectId, "inactive-member")).rejects.toThrow("active member");
    expect(state.insert).not.toHaveBeenCalled();
    state.selected = [[{ id: "member", name: "Member", image: null }]];
    state.values.mockImplementation(() => { throw new Error("Database unavailable"); });
    await expect(addProjectManager(projectId, "member")).rejects.toThrow("Database unavailable");
  });
});
