import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  sync: vi.fn(),
  seed: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: m.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    select: m.select,
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ select: m.select, update: m.update }),
  },
}));
vi.mock("@/lib/print/budget-sync", () => ({
  syncPrintEstimateToBudget: m.sync,
}));
vi.mock("@/lib/budget/actions", () => ({ seedDefaultBudget: m.seed }));
vi.mock("@/lib/budget/queries", () => ({
  getOrCreateBudgetSettings: m.settings,
}));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  stopUsingPrintEstimateQuote,
  selectPrintEstimateQuote,
} from "./estimate-review-actions";

let rows: unknown[][];
let writes: { table: string; values: Record<string, unknown> }[];
beforeEach(() => {
  vi.resetAllMocks();
  writes = [];
  m.auth.mockResolvedValue({ user: { id: "manager" } });
  m.settings.mockResolvedValue({ currency: "USD" });
  rows = [
    [
      {
        id: "q",
        projectId: "p",
        runId: "r",
        quantityCps: 2000,
        totalAmount: "900",
        currency: "USD",
      },
    ],
    [{ id: "p" }],
    [{ id: "r", kind: "budget_estimate", status: "quote_requested" }],
    [{ id: "r", kind: "budget_estimate" }],
    [{ id: "old", runId: "r", quantityCps: 1000 }],
    [{ slug: "book" }],
  ];
  m.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => rows.shift(),
        for: async () => rows.shift(),
        then: (resolve: (r: unknown) => unknown) => resolve(rows.shift()),
      }),
    }),
  }));
  m.update.mockImplementation((table) => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        writes.push({ table: getTableName(table), values });
      },
    }),
  }));
});

describe("estimate review financial boundary", () => {
  it("selects one reviewed estimate without accepting an order or touching payments, and seeds an empty book budget", async () => {
    expect(
      await selectPrintEstimateQuote("q", {
        quantityCps: 3000,
        totalAmount: 1200,
        currency: "USD",
      }),
    ).toEqual({});
    expect(m.auth).toHaveBeenCalledWith("manager");
    expect(writes).toEqual([
      {
        table: "print_quotes",
        values: expect.objectContaining({ reviewStatus: "active" }),
      },
      {
        table: "print_quotes",
        values: expect.objectContaining({
          reviewStatus: "estimated",
          acceptedAt: null,
          quantityCps: 3000,
          totalAmount: "1200.00",
        }),
      },
    ]);
    expect(m.seed).toHaveBeenCalledWith("p");
    expect(m.sync).toHaveBeenCalledWith("p");
  });
  it("uses a forwarded print-run quote as the estimate without accepting it, and returns the previous one to review", async () => {
    rows = [
      [
        {
          id: "q",
          projectId: "p",
          runId: "run",
          kind: "quote",
          reviewStatus: "suggested",
          quantityCps: 2000,
          totalAmount: "1440",
          currency: "USD",
        },
      ],
      [{ id: "p" }],
      [{ id: "run", kind: "first_print", status: "quote_received" }],
      [{ id: "run", kind: "first_print" }],
      [{ id: "old", runId: "run", quantityCps: 1000 }],
      [], // nothing else suggested at 1,000 copies
      [{ slug: "book" }],
    ];
    expect(await selectPrintEstimateQuote("q")).toEqual({});
    expect(writes).toEqual([
      // "active" would count as a reviewed price and take over the budget.
      {
        table: "print_quotes",
        values: expect.objectContaining({ reviewStatus: "suggested" }),
      },
      {
        table: "print_quotes",
        values: expect.objectContaining({
          reviewStatus: "estimated",
          acceptedAt: null,
        }),
      },
    ]);
    expect(m.sync).toHaveBeenCalledWith("p");
  });
  it("retires a released print-run quote when a newer suggestion holds its tier, so the save cannot break the tier index", async () => {
    rows = [
      [
        {
          id: "q",
          projectId: "p",
          runId: "run",
          reviewStatus: "estimated",
          quantityCps: 2000,
        },
      ],
      [{ id: "p" }],
      [{ kind: "first_print" }],
      [{ id: "newer", kind: "quote" }],
      [{ slug: "book" }],
    ];
    expect(await stopUsingPrintEstimateQuote("q")).toEqual({});
    expect(writes).toEqual([
      {
        table: "print_quotes",
        values: expect.objectContaining({ reviewStatus: "rejected" }),
      },
    ]);
    expect(m.sync).toHaveBeenCalledWith("p");
  });
  it("only clears the selected estimate on a print run, leaving accepted orders untouched", async () => {
    rows = [
      [{ id: "q", projectId: "p", runId: "run", reviewStatus: "accepted" }],
      [{ id: "p" }],
      [{ kind: "first_print" }],
    ];
    expect(await stopUsingPrintEstimateQuote("q")).toHaveProperty("error");
    expect(writes).toEqual([]);
    expect(m.sync).not.toHaveBeenCalled();
  });
  it("refuses accepted orders, reprint quotes, and mismatched currencies before changing the budget", async () => {
    rows[0] = [
      {
        id: "q",
        projectId: "p",
        runId: "r",
        kind: "quote",
        reviewStatus: "accepted",
        quantityCps: 2000,
        totalAmount: "900",
        currency: "USD",
      },
    ];
    rows[2] = [{ id: "r", kind: "first_print", status: "quote_received" }];
    expect(await selectPrintEstimateQuote("q")).toHaveProperty("error");
    expect(writes).toEqual([]);
    expect(m.sync).not.toHaveBeenCalled();
    rows = [
      [
        {
          id: "q",
          projectId: "p",
          runId: "r",
          kind: "quote",
          reviewStatus: "suggested",
          totalAmount: "900",
          currency: "USD",
        },
      ],
      [{ id: "p" }],
      [{ id: "r", kind: "reprint", status: "quote_received" }],
    ];
    expect(await selectPrintEstimateQuote("q")).toHaveProperty("error");
    expect(writes).toEqual([]);
    rows = [
      [
        {
          id: "q",
          projectId: "p",
          runId: "r",
          totalAmount: "900",
          currency: "EUR",
        },
      ],
      [{ id: "p" }],
      [{ kind: "budget_estimate" }],
    ];
    expect(await selectPrintEstimateQuote("q")).toHaveProperty("error");
    expect(writes).toEqual([]);
    expect(m.seed).not.toHaveBeenCalled();
  });
  it("denies non-manager calls before reading or writing finance records", async () => {
    m.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(selectPrintEstimateQuote("q")).rejects.toThrow("Forbidden");
    await expect(stopUsingPrintEstimateQuote("q")).rejects.toThrow("Forbidden");
    expect(m.select).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
});
