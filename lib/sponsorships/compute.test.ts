import { describe, expect, it } from "vitest";
import { allocateSponsorshipCents, calendarDate, decimalAmount, moneyCents, receiptInputSchema, sponsorshipInputSchema, sponsorshipProjectShares, sponsorshipTotalCents } from "./compute";

describe("sponsorship amounts", () => {
  it("prices the two-book example exactly", () => {
    const lines = [{ projectId: "apj", quantity: 250, unitPrice: "2.00" }, { projectId: "gngj", quantity: 250, unitPrice: "2" }];
    expect(sponsorshipTotalCents(lines)).toBe(100000);
    expect(sponsorshipProjectShares(lines)).toEqual([{ projectId: "apj", cents: 50000 }, { projectId: "gngj", cents: 50000 }]);
    expect(moneyCents("0.29")).toBe(29);
    expect(decimalAmount(29)).toBe("0.29");
  });
  it.each(["", "1.001", "NaN", "1e3", "-5", "1,000.00", "1000000000.01"])("rejects invalid financial input %s", value => {
    expect(() => moneyCents(value)).toThrow();
  });
  it("combines different sponsorship prices for the same book", () => {
    expect(sponsorshipProjectShares([{ projectId: "book", quantity: 3, unitPrice: "2.50" }, { projectId: "book", quantity: 2, unitPrice: "1.50" }]))
      .toEqual([{ projectId: "book", cents: 1050 }]);
  });
  it.each(["2026-02-29", "2026-02-31", "2026-13-01", "2026-1-01"])("rejects invalid dates %s", date => {
    expect(calendarDate.safeParse(date).success).toBe(false);
  });
  it("rejects fractional copies and zero-price lines", () => {
    const input = { title: "Books", partnerId: null, recipientName: "Partner", recipientEmail: "", recipientAddress: "", currency: "USD", dueDate: "", notes: "",
      lines: [{ projectId: "00000000-0000-4000-8000-000000000001", description: "Book sponsorship", quantity: 1.5, unitPrice: "0.00" }] };
    expect(sponsorshipInputSchema.safeParse(input).success).toBe(false);
  });
  it("rejects a payment with more net funds than gross funds", () => {
    expect(receiptInputSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", invoiceId: "00000000-0000-4000-8000-000000000002", amount: "100.00", actualNetAmount: "101.00", receivedDate: "2026-10-05", note: "" }).success).toBe(false);
  });
});

describe("exact sponsorship allocations", () => {
  it("splits partial payments and reserves the remaining cents for later", () => {
    const shares = [{ projectId: "a", cents: 50000 }, { projectId: "b", cents: 50000 }];
    const first = allocateSponsorshipCents(33333, shares);
    expect(first).toEqual([{ projectId: "a", cents: 16667 }, { projectId: "b", cents: 16666 }]);
    const remaining = shares.map((row, i) => ({ ...row, cents: row.cents - first[i].cents }));
    expect(allocateSponsorshipCents(66667, remaining)).toEqual(remaining);
  });
  it("distributes net funds without exceeding any book's gross allocation", () => {
    expect(allocateSponsorshipCents(2, [{ projectId: "a", cents: 1 }, { projectId: "b", cents: 2 }]))
      .toEqual([{ projectId: "a", cents: 1 }, { projectId: "b", cents: 1 }]);
  });
  it("handles products larger than the safe floating-point integer range", () => {
    expect(allocateSponsorshipCents(99999999999, [{ projectId: "a", cents: 50000000000 }, { projectId: "b", cents: 50000000000 }]))
      .toEqual([{ projectId: "a", cents: 50000000000 }, { projectId: "b", cents: 49999999999 }]);
  });
  it("keeps sums and caps exact across unequal remaining balances", () => {
    for (const weights of [[1, 1, 1], [0, 7, 2], [3, 5, 11], [21, 0, 1]]) {
      const shares = weights.map((cents, i) => ({ projectId: String(i), cents }));
      for (let amount = 0; amount <= weights.reduce((a, b) => a + b, 0); amount++) {
        const result = allocateSponsorshipCents(amount, shares);
        expect(result.reduce((sum, row) => sum + row.cents, 0)).toBe(amount);
        expect(result.every((row, i) => row.cents >= 0 && row.cents <= weights[i])).toBe(true);
      }
    }
  });
});
