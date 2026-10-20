import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { PartnerQuoteLine } from "./partner-line-state";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidate: vi.fn(), transactions: vi.fn(),
  rows: [] as Array<PartnerQuoteLine & { projectId: string; printRunId: string | null }>,
  writes: [] as string[],
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("./revalidate", () => ({ revalidateBudget: mocks.revalidate }));
vi.mock("@/lib/db", async () => {
  const { getTableName } = await import("drizzle-orm");
  return { db: { transaction: mocks.transactions.mockImplementation(async (action) => action({
    select: () => ({ from: (table: Parameters<typeof getTableName>[0]) => {
      let condition: SQL;
      const query = {
        where: (where: SQL) => { condition = where; return query; },
        orderBy: () => query,
        for: async () => {
          const { params } = new PgDialect().sqlToQuery(condition);
          return getTableName(table) === "budget_scope_presentations" ? [{ deductionBps: 1300 }] :
            structuredClone(mocks.rows.filter((row) => row.projectId === params[0] && row.printRunId === (params[1] ?? null)));
        },
      };
      return query;
    } }),
    update: () => ({ set: (patch: { partnerUnitPrice: string | null }) => ({ where: (condition: SQL) => ({
      returning: async () => {
        const id = new PgDialect().sqlToQuery(condition).params[0] as string;
        mocks.writes.push(id);
        const row = mocks.rows.find((item) => item.id === id)!;
        row.partnerUnitPrice = patch.partnerUnitPrice == null ? null : Number(patch.partnerUnitPrice).toFixed(4);
        return [{ partnerUnitPrice: row.partnerUnitPrice }];
      },
    }) }) }),
  })) } };
});

import { applySuggestedPartnerRates, undoSuggestedPartnerRates } from "./partner-rate-actions";

const projectId = "00000000-0000-4000-8000-000000000001";
const audioId = "00000000-0000-4000-8000-000000000002";
const printId = "00000000-0000-4000-8000-000000000003";
const otherId = "00000000-0000-4000-8000-000000000004";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  mocks.writes = [];
  mocks.rows = [
    { id: audioId, projectId, printRunId: null, label: "Audiobook", partnerLabel: "Audio production", partnerVisible: true, partnerUnitPrice: null, unit: "words", quantity: "59000", unitPrice: "0.01", amount: "590" },
    { id: printId, projectId, printRunId: null, label: "Printing", partnerLabel: null, partnerVisible: true, partnerUnitPrice: "1500.0000", unit: "flat", quantity: "1", unitPrice: "2000", amount: "2000" },
    { id: otherId, projectId, printRunId: null, label: "Cover", partnerLabel: null, partnerVisible: true, partnerUnitPrice: "75.0000", unit: "flat", quantity: "1", unitPrice: "100", amount: "100" },
  ];
});

// These boundaries protect financial edits from unauthorized or stale undo requests.
it("authorizes both actions before accessing any budget data", async () => {
  mocks.auth.mockRejectedValue(new Error("Forbidden"));
  await expect(applySuggestedPartnerRates(projectId, null, [audioId])).rejects.toThrow("Forbidden");
  await expect(undoSuggestedPartnerRates(projectId, null, [])).rejects.toThrow("Forbidden");
  expect(mocks.transactions).not.toHaveBeenCalled();
});

it("restores explicit and inherited rates exactly and preserves other financial and public fields", async () => {
  const before = structuredClone(mocks.rows);
  const applied = await applySuggestedPartnerRates(projectId, null, [audioId, printId]);
  if (!("changes" in applied)) throw new Error(applied.error);
  expect(applied.changes).toEqual([
    { id: audioId, previousPartnerUnitPrice: null, appliedPartnerUnitPrice: applied.rates[audioId] },
    { id: printId, previousPartnerUnitPrice: "1500.0000", appliedPartnerUnitPrice: applied.rates[printId] },
  ]);
  expect(mocks.rows[0].partnerUnitPrice).not.toBeNull();
  expect(mocks.rows[1].partnerUnitPrice).not.toBe("1500.0000");
  expect(mocks.rows[2]).toEqual(before[2]);
  // Reapplying an unchanged target must not replace the useful undo snapshot.
  expect(await applySuggestedPartnerRates(projectId, null, [audioId, printId])).toMatchObject({ changes: [] });
  expect(await undoSuggestedPartnerRates(projectId, null, applied.changes)).toMatchObject({ rates: { [audioId]: null, [printId]: "1500.0000" } });
  expect(mocks.rows).toEqual(before);
  expect(mocks.revalidate).toHaveBeenCalledWith(projectId);
});

it("rejects the entire undo if a later edit changed one of its rates", async () => {
  const applied = await applySuggestedPartnerRates(projectId, null, [audioId, printId]);
  if (!("changes" in applied)) throw new Error(applied.error);
  mocks.rows[1].partnerUnitPrice = "2500.0000";
  const beforeUndo = structuredClone(mocks.rows);
  mocks.writes = [];
  expect(await undoSuggestedPartnerRates(projectId, null, applied.changes)).toMatchObject({ error: expect.stringContaining("changed") });
  expect(mocks.rows).toEqual(beforeUndo);
  expect(mocks.writes).toEqual([]);
});

it("cannot restore a line belonging to another budget scope", async () => {
  mocks.rows[0].printRunId = otherId;
  mocks.rows[0].partnerUnitPrice = "0.02";
  const beforeUndo = structuredClone(mocks.rows);
  expect(await undoSuggestedPartnerRates(projectId, null, [{ id: audioId, previousPartnerUnitPrice: null, appliedPartnerUnitPrice: "0.02" }]))
    .toMatchObject({ error: expect.stringContaining("changed") });
  expect(mocks.rows).toEqual(beforeUndo);
  expect(mocks.writes).toEqual([]);
});
