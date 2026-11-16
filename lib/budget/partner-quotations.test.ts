import { describe, expect, it } from "vitest";
import {
  reviewQuotationLines,
  reviewQuotationPrintOptions,
  partnerQuotationSchema,
  partnerQuotationVersion,
  quotationTotalCents,
} from "./partner-quotations";
import type { PartnerQuoteLine } from "./partner-line-state";

const item: PartnerQuoteLine = {
  id: "translation",
  label: "Internal cost",
  partnerLabel: "Translation",
  partnerVisible: true,
  partnerUnitPrice: "0.04",
  unit: "words",
  quantity: "10000",
  unitPrice: "0.03",
  amount: "300",
};

// A double-funded cost overstates the amount to request from partners.
describe("partner cost shares", () => {
  it("splits a public cost across partners using exact cents and canonical public wording", () => {
    const first = reviewQuotationLines(
      [{ budgetItemId: item.id, amountCents: 15001 }],
      [item],
      [],
    );
    const second = reviewQuotationLines(
      [{ budgetItemId: item.id, amountCents: 24999 }],
      [item],
      [{ lines: first }],
    );
    expect(first).toEqual([
      { budgetItemId: item.id, amountCents: 15001, label: "Translation" },
    ]);
    expect(
      quotationTotalCents({ lines: first }) +
        quotationTotalCents({ lines: second }),
    ).toBe(40000);
    expect(() =>
      reviewQuotationLines(
        [{ budgetItemId: item.id, amountCents: 25000 }],
        [item],
        [{ lines: first }],
      ),
    ).toThrow("exceed");
  });
  it("rejects hidden, deleted, foreign, and duplicate costs instead of exporting them", () => {
    const line = { budgetItemId: item.id, amountCents: 100 };
    expect(() =>
      reviewQuotationLines([line], [{ ...item, partnerVisible: false }], []),
    ).toThrow("no longer available");
    expect(() =>
      reviewQuotationLines([{ ...line, budgetItemId: "foreign" }], [item], []),
    ).toThrow("no longer available");
    expect(() => reviewQuotationLines([line, line], [item], [])).toThrow(
      "only once",
    );
  });
});

// Printing must not disappear from requests or inflate them by summing alternative runs.
it("allows a printing-only funding need without a partner and caps allocations per quantity", () => {
  const options = [100000, 150000, 200000].map((partnerAmountCents, index) => ({
    sourceQuoteId: `00000000-0000-4000-8000-00000000000${index}`,
    currency: "USD",
    quantity: (index + 1) * 1000,
    printingCostCents: 50000 + index,
    partnerAmountCents,
    label: "Printing",
  }));
  const input = {
    id: "00000000-0000-4000-8000-000000000004",
    projectId: "00000000-0000-4000-8000-000000000005",
    printRunId: null,
    title: "Printing needed",
    partnerId: null,
    partnerName: "",
    contactName: "",
    contactEmail: "",
    description: "",
    lines: [],
    printOptions: options,
  };
  expect(partnerQuotationSchema.safeParse(input).success).toBe(true);
  expect(
    partnerQuotationSchema.safeParse({ ...input, printOptions: [] }).success,
  ).toBe(false);
  const first = reviewQuotationPrintOptions(
    options.map((o) => ({
      ...o,
      label: "Forged label",
      printingCostCents: 1,
      partnerAmountCents: o.partnerAmountCents / 2,
    })),
    options,
    [],
    "USD",
  );
  expect(first[0]).toMatchObject({
    label: "Printing",
    printingCostCents: 50000,
  });
  const second = reviewQuotationPrintOptions(
    first,
    options,
    [{ printOptions: first }],
    "USD",
  );
  expect(quotationTotalCents({ lines: [], printOptions: first })).toBe(50000);
  expect(
    quotationTotalCents({
      lines: [
        {
          budgetItemId: "translation",
          label: "Translation",
          amountCents: 14846,
        },
      ],
      printOptions: options,
    }),
  ).toBe(114846);
  expect(
    quotationTotalCents({ lines: [], printOptions: first }) +
      quotationTotalCents({ lines: [], printOptions: second }),
  ).toBe(100000);
  expect(() =>
    reviewQuotationPrintOptions(
      [{ ...first[0], partnerAmountCents: 50001 }],
      options,
      [{ printOptions: first }],
      "USD",
    ),
  ).toThrow("exceed");
  expect(() =>
    reviewQuotationPrintOptions([options[0]], options, [], "EUR"),
  ).toThrow("unavailable");
  expect(() =>
    reviewQuotationPrintOptions([options[0], options[0]], options, [], "USD"),
  ).toThrow("only once");
  expect(() =>
    reviewQuotationPrintOptions([options[0]], [], [], "USD"),
  ).toThrow("unavailable");
  const saved = {
    ...input,
    currency: "USD",
    sourceFingerprint: "source",
    lines: [],
  };
  expect(partnerQuotationVersion(saved)).not.toBe(
    partnerQuotationVersion({ ...saved, printOptions: first }),
  );
});
