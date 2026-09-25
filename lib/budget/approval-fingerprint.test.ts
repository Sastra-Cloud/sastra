import { describe, expect, it } from "vitest";

import {
  budgetApprovalFingerprint,
  budgetApprovalTotal,
} from "@/lib/budget/approval-fingerprint";
import type { BudgetLine, BudgetSettings } from "@/lib/budget/queries";

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
