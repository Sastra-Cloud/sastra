import { describe, expect, it } from "vitest";
import { chooseBudgetPrintQuote } from "./estimate-policy";

const estimate = {
  id: "early",
  kind: "budget_estimate",
  status: "quote_requested",
  quantityTarget: null,
};
const production = {
  ...estimate,
  id: "production",
  kind: "first_print",
  status: "planning",
};
const quote = {
  id: "selected",
  runId: estimate.id,
  kind: "quote",
  reviewStatus: "estimated",
  quantityCps: 2000,
  totalAmount: "1800",
  unitPrice: null,
};

describe("budget print cost precedence", () => {
  it("retains the reviewed estimate until production has a reviewed price, then restores it when that price is rejected", () => {
    const actual = {
      ...quote,
      id: "actual",
      runId: production.id,
      totalAmount: "2400",
      reviewStatus: "suggested",
    };
    expect(
      chooseBudgetPrintQuote([estimate, production], [quote, actual]),
    ).toEqual(quote);
    actual.reviewStatus = "accepted";
    expect(
      chooseBudgetPrintQuote([estimate, production], [quote, actual]),
    ).toEqual(actual);
    actual.reviewStatus = "rejected";
    expect(
      chooseBudgetPrintQuote([estimate, production], [quote, actual]),
    ).toEqual(quote);
  });

  it("does not use unreviewed, superseded, cancelled, or reprint estimates as the main budget", () => {
    const reprint = { ...production, id: "reprint", kind: "reprint" };
    expect(
      chooseBudgetPrintQuote(
        [estimate, reprint],
        [
          { ...quote, reviewStatus: "suggested" },
          { ...quote, reviewStatus: "active" },
          { ...quote, runId: reprint.id, reviewStatus: "accepted" },
        ],
      ),
    ).toBeNull();
    expect(
      chooseBudgetPrintQuote([{ ...estimate, status: "cancelled" }], [quote]),
    ).toBeNull();
  });

  it("uses per-copy production prices and preserves the full order over its final balance", () => {
    const order = {
      ...quote,
      id: "order",
      runId: production.id,
      reviewStatus: "accepted",
      kind: "deposit_invoice",
      totalAmount: null,
      unitPrice: "1.25",
    };
    const balance = {
      ...order,
      id: "balance",
      kind: "final_invoice",
      totalAmount: "1000",
    };
    expect(
      chooseBudgetPrintQuote([estimate, production], [quote, balance, order]),
    ).toEqual(order);
  });
});
