import { describe, expect, it } from "vitest";
import { defaultInvoiceOwner, fundingTotalsReconcile } from "./funding-review";
import { normalizeExtraction, fillMouPaymentAmounts } from "@/lib/imports/schema";

describe("reviewed funding", () => {
  it("preserves the source's unequal cents in its two installments", () => {
    const extraction = fillMouPaymentAmounts(normalizeExtraction({ agreementTotalAmount: 12189.37,
      mouPaymentSchedule: [{ trigger: "on_signing", amount: 6094.69 }, { trigger: "on_completion", amount: 6094.68,
        deliveryRequirements: ["DOCX translations", "MP3 audio", "MP4 videos"], sourceClause: "Completion and delivery" }],
      projects: [{ title: "Articles/audio", totalAmount: 9199.89 }, { title: "Videos", totalAmount: 2989.48 }],
    }));
    expect(extraction.mouPaymentSchedule.map((row) => row.amount)).toEqual([6094.69, 6094.68]);
    expect(extraction.mouPaymentSchedule[1].deliveryRequirements).toEqual(["DOCX translations", "MP3 audio", "MP4 videos"]);
    expect(fundingTotalsReconcile(12189.37, [9199.89, 2989.48], [6094.69, 6094.68])).toBe(true);
    expect(fundingTotalsReconcile(12189.37, [9199.89, 2989.48], [6094.69, 6094.69])).toBe(false);
    expect(fundingTotalsReconcile(12189.37, [9199.89, 2989.49], [6094.69, 6094.68])).toBe(false);
  });
  it("defaults to a single eligible creator and requires review otherwise", () => {
    expect(defaultInvoiceOwner([{ id: "a", eligible: true }, { id: "a", eligible: true }])).toBe("a");
    expect(defaultInvoiceOwner([{ id: "a", eligible: true }, { id: "b", eligible: true }])).toBeNull();
    expect(defaultInvoiceOwner([{ id: "a", eligible: false }])).toBeNull();
    expect(defaultInvoiceOwner([{ id: null, eligible: false }])).toBeNull();
    expect(defaultInvoiceOwner([])).toBeNull();
  });
});
