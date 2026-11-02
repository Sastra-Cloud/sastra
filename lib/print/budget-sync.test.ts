import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const m = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  approval: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: m.select,
    update: m.update,
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ select: m.select, update: m.update }),
  },
}));
vi.mock("@/lib/budget/approval-service", () => ({
  syncBudgetApprovalState: m.approval,
}));
import { syncPrintEstimateToBudget } from "./budget-sync";

let line: Record<string, unknown>;
let quotes: Record<string, unknown>[];
let runs: Record<string, unknown>[];
beforeEach(() => {
  vi.resetAllMocks();
  line = {
    id: "line",
    amount: "100",
    amountSecured: "300",
    amountSpent: "75",
    partnerUnitPrice: "140",
  };
  runs = [
    { id: "early", kind: "budget_estimate", status: "quote_requested" },
    { id: "actual", kind: "first_print", status: "planning" },
  ];
  quotes = [
    {
      id: "q",
      runId: "early",
      reviewStatus: "estimated",
      quantityCps: 2000,
      totalAmount: "1200",
      currency: "USD",
    },
  ];
  m.select.mockReturnValue({
    from: (table: Parameters<typeof getTableName>[0]) => ({
      where: () => ({
        for: async () => [],
        orderBy: async () =>
          getTableName(table) === "print_runs" ? runs : quotes,
        limit: async () => [line],
      }),
    }),
  });
  m.update.mockReturnValue({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        line = { ...line, ...values };
      },
    }),
  });
});
it("updates the estimate then the actual commitment without overwriting paid spend, assigned funding, or partner prices", async () => {
  await syncPrintEstimateToBudget("p");
  expect(line).toMatchObject({
    amount: "1200.00",
    label: "Printing — 2,000 copies (estimate)",
    amountSpent: "75",
    amountSecured: "300",
    partnerUnitPrice: "140",
  });
  quotes.push({
    id: "production",
    runId: "actual",
    reviewStatus: "suggested",
    quantityCps: 2000,
    unitPrice: "0.9",
    totalAmount: null,
    currency: "USD",
  });
  await syncPrintEstimateToBudget("p");
  expect(line.amount).toBe("1200.00");
  quotes[1].reviewStatus = "accepted";
  await syncPrintEstimateToBudget("p");
  expect(line).toMatchObject({
    amount: "1800.00",
    label: "Printing — 2,000 copies (finalized)",
    amountSpent: "75",
    amountSecured: "300",
    partnerUnitPrice: "140",
  });
  expect(m.approval).toHaveBeenCalledWith("p");
});
