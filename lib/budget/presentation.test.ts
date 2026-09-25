import { describe, expect, it } from "vitest";

import {
  deductionPercentToBps,
  expectedNetCents,
  grossTargetCents,
  partnerQuoteTotalCents,
  suggestedPerCopyPriceCents,
  suggestPartnerRates,
} from "./compute";

describe("deduction-aware partner quotations", () => {
  it("stores a user-facing percentage as basis points", () => {
    expect(deductionPercentToBps(13)).toBe(1300);
    expect(deductionPercentToBps(10)).toBe(1000);
    expect(deductionPercentToBps(0.13)).toBe(13);
  });

  it("grosses up costs and never rounds below coverage", () => {
    expect(grossTargetCents(16_514_80, 1300)).toBe(18_982_53);
    expect(expectedNetCents(18_982_53, 1300)).toBeGreaterThanOrEqual(16_514_80);
  });

  it("rounds per-copy pricing upward to a cent", () => {
    expect(suggestedPerCopyPriceCents(16_514_80, 1300, 25_000)).toBe(76);
  });

  it("puts the gross-up into selected public rates", () => {
    const items = [
      {
        id: "translation",
        unit: "words" as const,
        quantity: "100000",
        unitPrice: "0.03",
        amount: "3000",
      },
      {
        id: "print",
        unit: "flat" as const,
        quantity: "1",
        unitPrice: "1000",
        amount: "1000",
      },
    ];
    const rates = suggestPartnerRates(items, new Set(["translation"]), 1300);
    expect(rates.translation).toBe("0.0360");
    expect(
      partnerQuoteTotalCents([
        { ...items[0], partnerUnitPrice: rates.translation },
        items[1],
      ])
    ).toBeGreaterThanOrEqual(grossTargetCents(400_000, 1300));
  });

  it("covers hidden internal costs through the selected public lines", () => {
    const items = [
      {
        id: "print",
        unit: "flat" as const,
        quantity: "25000",
        unitPrice: "0.57",
        amount: "14250",
        partnerVisible: true,
      },
      {
        id: "shipping",
        unit: "flat" as const,
        quantity: "1",
        unitPrice: "2478.16",
        amount: "2478.16",
        partnerVisible: false,
      },
      {
        id: "handling",
        unit: "flat" as const,
        quantity: "1",
        unitPrice: "500",
        amount: "500",
        partnerVisible: false,
      },
    ];

    const rates = suggestPartnerRates(items, new Set(["print"]), 1300);
    expect(rates.print).toBe("0.80");
    expect(
      partnerQuoteTotalCents([
        { ...items[0], partnerUnitPrice: rates.print },
        items[1],
        items[2],
      ])
    ).toBeGreaterThanOrEqual(grossTargetCents(1_722_816, 1300));
  });

  it("never underfunds when stored amounts differ from quantity times rate", () => {
    const items = [
      {
        id: "translation",
        unit: "words" as const,
        quantity: "78000",
        unitPrice: "0.0200",
        amount: "1638.00",
      },
      {
        id: "editing",
        unit: "words" as const,
        quantity: "78000",
        unitPrice: "0.0200",
        amount: "1638.00",
      },
      {
        id: "proofreading",
        unit: "words" as const,
        quantity: "78000",
        unitPrice: "0.0100",
        amount: "780.00",
      },
      {
        id: "management",
        unit: "project" as const,
        quantity: "1",
        unitPrice: "200.00",
        amount: "200.00",
      },
    ];

    const rates = suggestPartnerRates(
      items,
      new Set(items.map((item) => item.id)),
      1300
    );
    const quoteCents = partnerQuoteTotalCents(
      items.map((item) => ({
        ...item,
        partnerUnitPrice: rates[item.id],
      }))
    );

    expect(rates).toEqual({
      translation: "0.0242",
      editing: "0.0242",
      proofreading: "0.0115",
      management: "229.89",
    });
    expect(quoteCents).toBeGreaterThanOrEqual(
      grossTargetCents(425_600, 1300)
    );
    expect(expectedNetCents(quoteCents, 1300)).toBeGreaterThanOrEqual(425_600);
  });
});
