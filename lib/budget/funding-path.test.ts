import { describe, expect, it } from "vitest";

import {
  buildFundingPath,
  fundingPathAttention,
  openDonationPromiseCents,
  splitAgreedAmount,
} from "./funding-path";

const today = new Date("2026-11-09T00:00:00Z");
const proposal = (patch: Record<string, unknown> = {}) => ({
  id: "p1",
  status: "sent",
  fundingPath: null,
  agreedAmount: null,
  totalAmount: "12000.00",
  sentAt: "2026-10-30T00:00:00Z",
  ...patch,
});

describe("buildFundingPath", () => {
  it("asks for an answer while a proposal waits, even after money arrives", () => {
    const [row] = buildFundingPath({
      proposals: [proposal()],
      payments: [],
      receipts: [{ id: "r1", proposalId: "p1", amount: "500.00" }],
      today,
    });
    expect(row).toMatchObject({
      answer: "waiting",
      nextStep: "record_answer",
      promisedCents: null,
      receivedCents: 50000,
      waitingDays: 10,
    });
  });

  it("uses scheduled payments as the promise and counts each receipt once", () => {
    const [row] = buildFundingPath({
      proposals: [
        proposal({ status: "accepted", fundingPath: "no_mou", agreedAmount: "12000.00" }),
      ],
      payments: [
        { id: "m1", proposalId: "p1", amount: "6000.00", paidAt: "2026-11-01", receiptId: "r1" },
        { id: "m2", proposalId: "p1", amount: "5000.00", paidAt: null, receiptId: null },
        { id: "other", proposalId: null, amount: "900.00", paidAt: null, receiptId: null },
      ],
      // The receipt paid more than scheduled and is also linked directly.
      receipts: [{ id: "r1", proposalId: "p1", amount: "6100.00" }],
      today,
    });
    expect(row).toMatchObject({
      answer: "no_mou",
      promisedCents: 1100000,
      receivedCents: 610000,
      expectedPaymentCount: 2,
      nextStep: "open_payments",
    });
  });

  it("flags an agreed proposal that has no expected payments", () => {
    const rows = buildFundingPath({
      proposals: [
        proposal({ status: "accepted", fundingPath: "mou", agreedAmount: "12000.00" }),
      ],
      payments: [],
      receipts: [],
      today,
    });
    expect(rows[0]).toMatchObject({ promisedCents: 1200000, nextStep: "add_payments" });
    expect(fundingPathAttention(rows).agreedWithoutPaymentsCount).toBe(1);
  });

  it("waits for a donation until the promised amount has arrived", () => {
    const base = {
      proposals: [
        proposal({ status: "accepted", fundingPath: "donation", agreedAmount: "1000.00" }),
      ],
      payments: [],
      today,
    };
    expect(
      buildFundingPath({ ...base, receipts: [{ id: "r1", proposalId: "p1", amount: "400.00" }] })[0]
        .nextStep
    ).toBe("wait_donation");
    expect(
      buildFundingPath({ ...base, receipts: [{ id: "r1", proposalId: "p1", amount: "1000.00" }] })[0]
        .nextStep
    ).toBe("done");
  });
});

describe("openDonationPromiseCents", () => {
  it("counts only the part of a donation promise that has not arrived", () => {
    const promises = openDonationPromiseCents({
      proposals: [
        proposal({ status: "accepted", fundingPath: "donation", agreedAmount: "1000.00" }),
        // No fixed amount, an MoU, and a declined proposal add nothing.
        proposal({ id: "p2", status: "accepted", fundingPath: "donation" }),
        proposal({ id: "p3", status: "accepted", fundingPath: "mou", agreedAmount: "9000.00" }),
        proposal({ id: "p4", status: "declined", fundingPath: "donation", agreedAmount: "700.00" }),
      ],
      payments: [{ id: "m1", proposalId: null, amount: "250.00", receiptId: "r2" }],
      receipts: [
        { id: "r1", proposalId: "p1", amount: "400.00" },
        // Already counted through its scheduled payment.
        { id: "r2", proposalId: "p1", amount: "250.00" },
      ],
    });
    expect(promises).toBe(60000);
  });
});

it("keeps the odd cent on the final payment", () => {
  expect(splitAgreedAmount(100001, 2)).toEqual([50000, 50001]);
  expect(splitAgreedAmount(100001, 1)).toEqual([100001]);
});
