import { describe, expect, it, vi } from "vitest";

import { convertExtractionToUsd } from "@/lib/imports/fx";
import { normalizeExtraction } from "@/lib/imports/schema";

describe("convertExtractionToUsd", () => {
  it("uses one locked rate and retains source amounts in line notes", async () => {
    const input = normalizeExtraction({
      agreementType: "license_only",
      agreementTotalAmount: 100,
      sharedFees: [
        {
          label: "Administration fee",
          category: "custom",
          amount: 100,
          appliesToTitles: [],
        },
      ],
      projects: [
        { title: "A", currency: "GBP" },
        { title: "B", currency: "GBP" },
      ],
    });
    const loader = vi.fn(async () => ({
      from: "GBP",
      to: "USD" as const,
      rate: 1.25,
      rateDate: "2026-07-10",
      provider: "ECB via Frankfurter",
    }));

    const out = await convertExtractionToUsd(input, loader);

    expect(loader).toHaveBeenCalledOnce();
    expect(out.agreementTotalAmount).toBe(125);
    expect(out.projects.map((project) => project.currency)).toEqual([
      "USD",
      "USD",
    ]);
    expect(out.projects.map((project) => project.totalAmount)).toEqual([
      62.5,
      62.5,
    ]);
    expect(out.projects[0].budgetLines[0]).toMatchObject({
      unitPrice: 62.5,
      amount: 62.5,
    });
    expect(out.projects[0].budgetLines[0].notes).toContain("GBP 50.00");
    expect(out.projects[0].budgetLines[0].notes).toContain("USD 62.50");
    expect(out.projects[0].fxConversion).toEqual({
      from: "GBP",
      to: "USD",
      rate: 1.25,
      rateDate: "2026-07-10",
      provider: "ECB via Frankfurter",
    });
  });

  it("leaves the source currency intact when no rate is available", async () => {
    const input = normalizeExtraction({
      agreementType: "license_only",
      projects: [
        {
          title: "A",
          currency: "GBP",
          totalAmount: 10,
          budgetLines: [
            {
              label: "Fee",
              category: "custom",
              unit: "flat",
              quantity: 1,
              unitPrice: 10,
              amount: 10,
            },
          ],
        },
      ],
    });

    const out = await convertExtractionToUsd(input, async () => null);

    expect(out.projects[0].currency).toBe("GBP");
    expect(out.projects[0].totalAmount).toBe(10);
    expect(out.projects[0].fxConversion).toBeNull();
  });
});
