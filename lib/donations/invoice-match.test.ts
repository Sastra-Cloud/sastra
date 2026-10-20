import { describe, expect, it } from "vitest";
import {
  donationInvoiceCandidates,
  matchDonationInvoices,
  type DonationInvoiceCandidate,
  type DonationInvoiceSource,
} from "./invoice-match";

const donation = {
  donor: "Reading Partner",
  notes: null,
  amountCents: 10000,
  currency: "USD",
};
const invoice: DonationInvoiceCandidate = {
  id: "invoice-a",
  invoiceNumber: "INV-100",
  currency: "USD",
  recipientName: "Reading Partner",
  status: "sent",
  amountCents: 10000,
  mouPaymentId: null,
  sharedMouGroupId: null,
  sponsorshipId: null,
  allocations: [
    { projectId: "book-a", projectTitle: "Book A", amountCents: 10000 },
  ],
};
const sponsor: DonationInvoiceCandidate = {
  ...invoice,
  sponsorshipId: "sponsor",
  allocations: [
    {
      projectId: "book-a",
      projectTitle: "Book A",
      amountCents: 6000,
      actualNetCents: 5400,
    },
    {
      projectId: "book-b",
      projectTitle: "Book B",
      amountCents: 4000,
      actualNetCents: 3600,
    },
  ],
};

describe("sent invoice donation matching", () => {
  it("combines a referenced invoice with another invoice for the same donor", () => {
    const first = { ...invoice, amountCents: 4000, allocations: [{ ...invoice.allocations[0], amountCents: 4000 }] };
    const second = { ...invoice, id: "second", invoiceNumber: "INV-101", amountCents: 6000, allocations: [{ ...invoice.allocations[0], amountCents: 6000 }] };
    expect(matchDonationInvoices({ ...donation, notes: "Payment includes INV-100" }, [first, second])?.allocations.map(row => row.amount)).toEqual(["40.00", "60.00"]);
  });
  it("uses a complete explicit reference even for a donor with many invoices", () => {
    const others = Array.from({ length: 25 }, (_, index) => ({ ...invoice, id: `other-${index}`, invoiceNumber: `OTHER-${index}` }));
    expect(matchDonationInvoices({ ...donation, notes: "INV-100" }, [invoice, ...others])?.allocations[0].invoiceId).toBe(invoice.id);
  });
  it("uses standalone sent invoices even without a MoU payment", () => {
    const result = matchDonationInvoices(donation, [invoice]);
    expect(result?.confidence).toBe("strong");
    expect(result?.allocations[0]).toMatchObject({
      invoiceId: invoice.id,
      mouPaymentId: null,
      amount: "100.00",
    });
  });
  it("uses an explicit invoice number when the payer name differs", () => {
    expect(
      matchDonationInvoices(
        { ...donation, donor: "Giving service", notes: "Payment for INV-100" },
        [invoice]
      )?.confidence
    ).toBe("strong");
    expect(
      matchDonationInvoices(
        { ...donation, donor: "Giving service", notes: "Payment for INV-1000" },
        [invoice]
      )
    ).toBeNull();
  });
  it.each(["issued", "void", "received"])("excludes %s invoices", (status) => {
    expect(
      matchDonationInvoices(donation, [{ ...invoice, status }])
    ).toBeNull();
  });
  it("excludes other currencies, refunds, and unrelated recipients", () => {
    expect(
      matchDonationInvoices({ ...donation, currency: "EUR" }, [invoice])
    ).toBeNull();
    expect(
      matchDonationInvoices({ ...donation, amountCents: -10000 }, [invoice])
    ).toBeNull();
    expect(
      matchDonationInvoices({ ...donation, donor: "Unrelated" }, [invoice])
    ).toBeNull();
  });
  it("keeps the multi-book sponsorship split and separate net amounts", () => {
    const result = matchDonationInvoices(donation, [sponsor]);
    expect(
      result?.allocations.map((row) => [
        row.amount,
        row.actualNetAmount,
        row.sponsorshipId,
      ])
    ).toEqual([
      ["60.00", "54.00", "sponsor"],
      ["40.00", "36.00", "sponsor"],
    ]);
  });
  it("combines normal and multi-book sponsorship invoices", () => {
    const result = matchDonationInvoices({ ...donation, amountCents: 20000 }, [
      invoice,
      { ...sponsor, id: "invoice-b", invoiceNumber: "INV-101" },
    ]);
    expect(result?.allocations).toHaveLength(3);
    expect(result?.summary).toBe("Matches 2 sent invoices.");
  });
  it("flags equal totals instead of picking the first invoice", () => {
    const result = matchDonationInvoices(donation, [
      invoice,
      { ...invoice, id: "invoice-b", invoiceNumber: "INV-101" },
    ]);
    expect(result?.confidence).toBe("possible");
    expect(result?.allocations).toEqual([]);
  });
  it("uses explicit references to resolve equal invoice totals", () => {
    const result = matchDonationInvoices({ ...donation, notes: "INV-101" }, [
      invoice,
      { ...invoice, id: "invoice-b", invoiceNumber: "INV-101" },
    ]);
    expect(result?.allocations[0].invoiceId).toBe("invoice-b");
  });
  it("splits a partial sponsorship payment with exact cents", () => {
    const result = matchDonationInvoices({ ...donation, amountCents: 3333 }, [
      sponsor,
    ]);
    expect(result?.allocations.map((row) => row.amount)).toEqual([
      "20.00",
      "13.33",
    ]);
    expect(result?.allocations.map((row) => row.actualNetAmount)).toEqual([
      "18.00",
      "12.00",
    ]);
    expect(result?.evidence.join(" ")).toContain("partial sponsorship payment");
  });
  it("does not partially settle a production invoice or guess between sponsorships", () => {
    expect(
      matchDonationInvoices({ ...donation, amountCents: 3333 }, [invoice])
    ).toBeNull();
    expect(
      matchDonationInvoices({ ...donation, amountCents: 3333 }, [
        sponsor,
        { ...sponsor, id: "other" },
      ])
    ).toBeNull();
  });
});

describe("invoice balances", () => {
  it("uses the same reviewed shared-MoU rounding as posting", () => {
    const result = donationInvoiceCandidates([{ ...source, amount: "150.01", sponsorshipId: null, sharedMouGroupId: "group", lineItems: null }], titles, new Map([["group", [
      { projectId: "book-a", allocationCents: 6000 }, { projectId: "book-b", allocationCents: 4000 },
    ]]]), []);
    expect(result[0].allocations.map(row => row.amountCents)).toEqual([9001, 6000]);
  });
  const source: DonationInvoiceSource = {
    ...invoice,
    projectId: "book-a",
    amount: "100.00",
    lineItems: [
      { projectId: "book-a", quantity: 3, unitPrice: "20.00" },
      { projectId: "book-b", quantity: 2, unitPrice: "20.00" },
    ],
    sponsorshipId: "sponsor",
    paidAt: null,
    deductionBps: 1000,
  };
  const titles = new Map([
    ["book-a", "Book A"],
    ["book-b", "Book B"],
  ]);
  it("subtracts earlier sponsorship receipts by book", () => {
    const result = donationInvoiceCandidates([source], titles, new Map(), [
      { invoiceId: source.id, projectId: "book-a", amount: "20.00" },
    ]);
    expect(result[0].amountCents).toBe(8000);
    expect(
      result[0].allocations.map((row) => [row.amountCents, row.actualNetCents])
    ).toEqual([
      [4000, 3600],
      [4000, 3600],
    ]);
  });
  it("excludes a MoU that is already paid even when invoice status is stale", () => {
    expect(
      donationInvoiceCandidates(
        [{ ...source, paidAt: new Date() }],
        titles,
        new Map(),
        []
      )
    ).toEqual([]);
  });
  it("does not use incomplete project splits or fully paid sponsorships", () => {
    expect(
      donationInvoiceCandidates([source], new Map(), new Map(), [])
    ).toEqual([]);
    expect(
      donationInvoiceCandidates([source], titles, new Map(), [
        { invoiceId: source.id, projectId: "book-a", amount: "60.00" },
        { invoiceId: source.id, projectId: "book-b", amount: "40.00" },
      ])
    ).toEqual([]);
  });
});
