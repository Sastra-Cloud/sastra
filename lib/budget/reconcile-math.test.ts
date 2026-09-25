import { describe, expect, it } from "vitest";

import {
  computeCashflow,
  reconcileLines,
  toCents,
} from "./reconcile-math";

describe("toCents", () => {
  it("converts amounts without float drift", () => {
    expect(toCents("4260.00")).toBe(426000);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(null)).toBe(0);
    expect(toCents("garbage")).toBe(0);
  });
});

describe("reconcileLines", () => {
  const printLine = {
    id: "line-1",
    category: "print_ship",
    label: "Print & ship",
    currency: "USD",
    amountSpent: "4000.00",
  };

  it("flags a variance between manual spent and recorded payments", () => {
    const rows = reconcileLines({
      items: [printLine],
      paymentsByCategory: {
        print_ship: [
          { amount: "2556.00", currency: "USD" },
          { amount: "1704.00", currency: "USD" },
        ],
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].spentRecordedCents).toBe(426000);
    expect(rows[0].varianceCents).toBe(26000); // recorded $4,260 − manual $4,000
    expect(rows[0].paymentCount).toBe(2);
  });

  it("reports zero variance when they match", () => {
    const rows = reconcileLines({
      items: [{ ...printLine, amountSpent: "4260.00" }],
      paymentsByCategory: {
        print_ship: [{ amount: "4260.00", currency: "USD" }],
      },
    });
    expect(rows[0].varianceCents).toBe(0);
  });

  it("excludes payments in a different currency (no FX)", () => {
    const rows = reconcileLines({
      items: [printLine],
      paymentsByCategory: {
        print_ship: [
          { amount: "1000.00", currency: "USD" },
          { amount: "9999.00", currency: "RMB" },
        ],
      },
    });
    expect(rows[0].spentRecordedCents).toBe(100000);
    expect(rows[0].paymentCount).toBe(1);
  });

  it("skips categories with no recorded-payment mapping", () => {
    const rows = reconcileLines({
      items: [
        printLine,
        { id: "t", category: "translation", label: "Translation", currency: "USD", amountSpent: "500" },
      ],
      paymentsByCategory: { print_ship: [] },
    });
    expect(rows.map((r) => r.category)).toEqual(["print_ship"]);
  });
});

describe("computeCashflow", () => {
  it("buckets by month with cumulative net and fills gaps", () => {
    const months = computeCashflow({
      inflows: [
        { amount: "1000.00", date: "2026-01-15" },
        { amount: "500.00", date: "2026-03-02" },
      ],
      outflows: [{ amount: "300.00", date: new Date("2026-01-20T00:00:00Z") }],
    });
    expect(months.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(months[0]).toMatchObject({
      inCents: 100000,
      outCents: 30000,
      netCents: 70000,
      cumulativeCents: 70000,
    });
    expect(months[1]).toMatchObject({ inCents: 0, outCents: 0, cumulativeCents: 70000 });
    expect(months[2].cumulativeCents).toBe(120000);
  });

  it("ignores undated events and returns [] when empty", () => {
    expect(
      computeCashflow({ inflows: [{ amount: "5", date: null }], outflows: [] })
    ).toEqual([]);
  });
});
