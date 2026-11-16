import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { getTableName, type SQL } from "drizzle-orm";
import type { BudgetLine, BudgetPresentation, BudgetSettings } from "./queries";
import type { PartnerQuotationDTO } from "./partner-quotations";

const state = vi.hoisted(() => ({
  settings: { currency: "USD" } as BudgetSettings,
  items: [] as BudgetLine[],
  presentation: null as BudgetPresentation | null,
  quotes: [] as PartnerQuotationDTO[],
  requests: [] as Array<Record<string, unknown>>,
  assignments: [] as Array<Record<string, unknown>>,
  writes: [] as Array<{ table: string; values: Record<string, unknown> }>,
  notify: vi.fn(),
}));
vi.mock("./queries", () => ({
  getBudgetData: async () => ({
    settings: state.settings,
    items: state.items,
    presentation: state.presentation,
  }),
}));
vi.mock("./partner-quotation-queries", () => ({
  listPartnerQuotations: async () => state.quotes,
}));
vi.mock("@/lib/notifications", () => ({ notifyMany: state.notify }));
vi.mock("@/lib/db", () => {
  const dialect = new PgDialect();
  const read = () => {
    let table = "";
    let where: { sql: string; params: unknown[] } | undefined;
    const rows = () => {
      if (table === "projects") return [{ title: "Book", slug: "book" }];
      if (table === "budget_approval_assignments") return state.assignments;
      if (table !== "budget_approval_requests")
        throw new Error(`Unexpected table ${table}`);
      if (where?.sql.includes('"partner_quotation_id"')) {
        return state.requests.filter((request) =>
          where!.sql.includes('"partner_quotation_id" is null')
            ? request.partnerQuotationId === null
            : where!.params.includes(request.partnerQuotationId),
        );
      }
      return state.requests.filter((request) =>
        where?.params.includes(request.id),
      );
    };
    const query = {
      from(t: Parameters<typeof getTableName>[0]) {
        table = getTableName(t);
        return query;
      },
      where(condition: SQL) {
        where = dialect.sqlToQuery(condition);
        return query;
      },
      orderBy() {
        return query;
      },
      limit() {
        return query;
      },
      then(
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown,
      ) {
        return Promise.resolve(rows()).then(resolve, reject);
      },
    };
    return query;
  };
  const tx = {
    select: read,
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          state.writes.push({ table: getTableName(table), values });
        },
      }),
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (values: Record<string, unknown>) => {
        state.writes.push({ table: getTableName(table), values });
        return {
          returning: async () => [
            { id: getTableName(table) === "tasks" ? "new-task" : "new-round" },
          ],
        };
      },
    }),
  };
  return {
    db: {
      ...tx,
      transaction: async (callback: (value: typeof tx) => unknown) =>
        callback(tx),
    },
  };
});
import {
  currentBudgetApprovalAuthorization,
  getBudgetApprovalSnapshot,
  syncBudgetApprovalState,
} from "./approval-service";

beforeEach(() => {
  state.quotes = [
    {
      id: "share",
      title: "Printing needed",
      partnerId: null,
      partnerName: "",
      contactName: "",
      contactEmail: "",
      description: "",
      currency: "USD",
      sourceFingerprint: "source",
      lines: [],
      printOptions: [
        {
          sourceQuoteId: "print",
          currency: "USD",
          quantity: 1000,
          printingCostCents: 109000,
          partnerAmountCents: 125000,
          label: "Printing",
        },
        {
          sourceQuoteId: "print-more",
          currency: "USD",
          quantity: 2000,
          printingCostCents: 144000,
          partnerAmountCents: 165000,
          label: "Printing",
        },
      ],
    },
  ];
  state.requests = [];
  state.assignments = [
    { approverId: "reviewer", taskId: "task", decision: "approved" },
  ];
  state.writes = [];
  vi.clearAllMocks();
});

// Approving one share must not approve another, or silently approve a changed recipient/price.
it("binds proposal review to its own share and printing alternatives", async () => {
  const first = await getBudgetApprovalSnapshot("project", null, "share");
  expect(first.totalAmount).toBe("1250.00");
  state.quotes.push({
    ...state.quotes[0],
    id: "other",
    partnerName: "Another partner",
  });
  expect(
    (await getBudgetApprovalSnapshot("project", null, "share")).fingerprint,
  ).toBe(first.fingerprint);
  state.quotes[0].printOptions![1].partnerAmountCents += 1;
  expect(
    (await getBudgetApprovalSnapshot("project", null, "share")).fingerprint,
  ).not.toBe(first.fingerprint);
  await expect(
    getBudgetApprovalSnapshot("project", null, "foreign"),
  ).rejects.toThrow("not found");
});

// Both optional gates must be honored at the actual send boundary.
it("requires the individual proposal and whole-budget approvals independently", async () => {
  const scoped = await getBudgetApprovalSnapshot("project", null, "share");
  const whole = await getBudgetApprovalSnapshot("project", null);
  state.requests = [
    {
      id: "whole",
      partnerQuotationId: null,
      status: "approved",
      fingerprint: whole.fingerprint,
    },
    {
      id: "proposal",
      partnerQuotationId: "share",
      status: "pending",
      fingerprint: scoped.fingerprint,
    },
  ];
  expect(
    (await currentBudgetApprovalAuthorization("project", null, "share")).ok,
  ).toBe(false);
  state.requests[1].status = "approved";
  expect(
    await currentBudgetApprovalAuthorization("project", null, "share"),
  ).toMatchObject({
    ok: true,
    requestId: "proposal",
    snapshot: { totalAmount: "1250.00" },
  });
  state.requests[0].status = "pending";
  expect(
    (await currentBudgetApprovalAuthorization("project", null, "share")).ok,
  ).toBe(false);
  expect(state.writes).toEqual([]);
});

// A revised approved proposal needs a new protected task and preserved review history.
it("supersedes approved proposal rounds and carries their specific scope into reapproval", async () => {
  state.requests = [
    {
      id: "old",
      partnerQuotationId: "share",
      status: "approved",
      fingerprint: "old-price",
      requesterId: "requester",
      dueDate: "2027-01-01",
    },
  ];
  expect(await syncBudgetApprovalState("project", null, "share")).toMatchObject(
    { changed: true, requestId: "new-round" },
  );
  expect(state.writes).toContainEqual({
    table: "budget_approval_requests",
    values: expect.objectContaining({
      status: "superseded",
      supersededFromStatus: "approved",
    }),
  });
  expect(state.writes).toContainEqual({
    table: "budget_approval_requests",
    values: expect.objectContaining({
      partnerQuotationId: "share",
      status: "pending",
      totalAmount: "1250.00",
    }),
  });
  expect(state.writes).toContainEqual({
    table: "tasks",
    values: expect.objectContaining({
      title: "Re-approve proposal: Printing needed — Book",
      assignedTo: "reviewer",
    }),
  });
  expect(state.notify).toHaveBeenCalledWith(
    ["reviewer"],
    expect.objectContaining({ link: "/projects/book/budget#proposal-share" }),
  );
});

// Already approved reviewers must lose their decisions when an in-flight share changes.
it("reopens existing protected tasks when a pending proposal changes", async () => {
  state.requests = [
    {
      id: "pending",
      partnerQuotationId: "share",
      status: "pending",
      fingerprint: "old-price",
    },
  ];
  await syncBudgetApprovalState("project", null, "share");
  expect(state.writes).toContainEqual({
    table: "budget_approval_assignments",
    values: expect.objectContaining({ decision: "pending", decidedAt: null }),
  });
  expect(state.writes).toContainEqual({
    table: "tasks",
    values: expect.objectContaining({ status: "todo", completedAt: null }),
  });
  expect(
    state.writes.filter((write) => write.table === "budget_approval_requests"),
  ).toHaveLength(1);
});
