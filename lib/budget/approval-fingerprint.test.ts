import { describe, expect, it } from "vitest";

import {
  budgetApprovalFingerprint,
  budgetApprovalTotal,
} from "@/lib/budget/approval-fingerprint";
import type { BudgetLine, BudgetSettings, BudgetPresentation } from "@/lib/budget/queries";

const settings = {
  wordCount: 1000,
  sourcePageCount: 10,
  wordsPerPage: 200,
  currency: "USD",
  rateTranslation: "0.0300",
  rateProofreading: "0.0100",
  rateEditing: "0.0300",
  rateCoverDesign: "100.0000",
  rateTypesetting: "3.0000",
  rateProjectManagement: "200.0000",
  ratePrintShip: "2000.0000",
  rateAudiobook: "0.0100",
  rateVideoSeries: "0.0100",
  partnerName: "Partner",
  partnerContactFirstName: "A",
  partnerContactLastName: "Reviewer",
  partnerContactEmail: "reviewer@example.com",
  partnerContact: null,
  partnerId: null,
  partnerContactId: null,
  workDescription: "Translate and publish",
} as BudgetSettings;

const item = {
  id: "item-1",
  projectId: "project-1",
  printRunId: null,
  group: "book_publishing",
  category: "translation",
  label: "Translation",
  sortOrder: 0,
  unit: "words",
  quantity: "1000.00",
  unitPrice: "0.03",
  amount: "30.00",
  isAutoQuantity: true,
  amountSecured: "0.00",
  amountSpent: "0.00",
  currency: "USD",
  notes: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
} as BudgetLine;

describe("budget approval fingerprint", () => {
  it("resets approval when a partner share or recipient changes, without invalidating legacy fingerprints", () => {
    const quote = { id: "quote", title: "Translation share", partnerId: null, partnerName: "Partner B", contactName: "Reviewer", contactEmail: "b@example.com", description: "Translation", currency: "USD", sourceFingerprint: "source", lines: [{ budgetItemId: item.id, label: "Translation", amountCents: 1000 }] };
    const before = budgetApprovalFingerprint(settings, [item], null, [quote]);
    expect(budgetApprovalFingerprint(settings, [item], null, [{ ...quote, contactEmail: "other@example.com" }])).not.toBe(before);
    expect(budgetApprovalFingerprint(settings, [item], null, [{ ...quote, lines: [{ ...quote.lines[0], amountCents: 1500 }] }])).not.toBe(before);
    expect(budgetApprovalFingerprint(settings, [item], null, [])).toBe(budgetApprovalFingerprint(settings, [item], null));
  });
  it("invalidates approval when a quantity option changes and records a minimum rather than a sum", () => {
    const presentation = { mode: "itemized", printOptions: [
      { sourceQuoteId: "quote", quantity: 1000, printingCostCents: 156000, partnerAmountCents: 180000, label: "Printing", currency: "USD" },
      { sourceQuoteId: "quote-2", quantity: 3000, printingCostCents: 267000, partnerAmountCents: 310000, label: "Printing", currency: "USD" },
    ] } as BudgetPresentation;
    const publicItem = { ...item, partnerVisible: true };
    const fingerprint = budgetApprovalFingerprint(settings, [publicItem], presentation);
    const changed = { ...presentation, printOptions: presentation.printOptions.map((option) => ({ ...option, quantity: option.quantity + 1 })) };
    expect(budgetApprovalFingerprint(settings, [publicItem], changed)).not.toBe(fingerprint);
    expect(budgetApprovalTotal([publicItem], presentation)).toBe("1830.00");
  });
  it("changes for partner-facing quotation edits", () => {
    const before = budgetApprovalFingerprint(settings, [item]);
    const after = budgetApprovalFingerprint(
      { ...settings, workDescription: "Translate, print, and publish" },
      [item]
    );
    expect(after).not.toBe(before);
  });

  it("ignores funding progress, actual spend, notes, and timestamps", () => {
    const before = budgetApprovalFingerprint(settings, [item]);
    const after = budgetApprovalFingerprint(settings, [
      {
        ...item,
        amountSecured: "30.00",
        amountSpent: "10.00",
        notes: "Internal note",
        updatedAt: new Date(),
      },
    ]);
    expect(after).toBe(before);
  });

  it("normalizes equivalent decimal formatting and totals every line", () => {
    const before = budgetApprovalFingerprint(settings, [item]);
    const after = budgetApprovalFingerprint(
      { ...settings, rateTranslation: "0.03" },
      [{ ...item, quantity: "1000", amount: "30.0" }]
    );
    expect(after).toBe(before);
    expect(budgetApprovalTotal([item, { ...item, id: "item-2", amount: "12.50" }]))
      .toBe("42.50");
  });
});
