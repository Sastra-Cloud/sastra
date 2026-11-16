import { expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { BudgetLine, BudgetSettings, BudgetPresentation } from "./queries";
import type { PartnerQuotationDTO } from "./partner-quotations";
const state = vi.hoisted(() => ({
  data: {} as {
    settings: BudgetSettings;
    items: BudgetLine[];
    presentation: BudgetPresentation | null;
  },
  quotes: [] as PartnerQuotationDTO[],
}));
vi.mock("./queries", () => ({ getBudgetData: async () => state.data }));
vi.mock("./partner-quotation-queries", () => ({
  listPartnerQuotations: async () => state.quotes,
}));
vi.mock("@/lib/workspace/queries", () => ({
  getWorkspaceSettings: async () => ({ orgName: "Example" }),
  getWorkspaceLogoFile: async () => null,
}));
vi.mock("@/lib/r2", () => ({ getObjectBuffer: vi.fn() }));
import { budgetApprovalFingerprint } from "./approval-fingerprint";
import { getPartnerQuotationContext } from "./partner-quotation-context";
import { buildAllocatedQuotationBuffer } from "./quotation-file";

// A partner attachment must never include another partner's work or internal budget details.
it("exports only the selected share and refuses to reuse it after its budget changes", async () => {
  state.data = {
    settings: {
      currency: "USD",
      partnerName: "OTHER PARTNER",
      partnerContact: "PRIVATE CONTACT",
      workDescription: "WHOLE PROJECT",
    } as BudgetSettings,
    items: [
      {
        id: "translation",
        category: "translation",
        group: "book_publishing",
        label: "PRIVATE LABEL",
        partnerLabel: "Translation",
        partnerVisible: true,
        quantity: "10000",
        unit: "words",
        unitPrice: "0.03",
        partnerUnitPrice: "0.04",
        amount: "300",
        notes: "PRIVATE NOTES",
      },
      {
        id: "audio",
        category: "audiobook",
        group: "additional_media",
        label: "AUDIO OTHER SHARE",
        partnerVisible: true,
        quantity: "1",
        unit: "flat",
        unitPrice: "900",
        amount: "900",
      },
    ] as BudgetLine[],
    presentation: {
      mode: "itemized",
      printOptions: [
        {
          sourceQuoteId: "print-1",
          currency: "USD",
          quantity: 1000,
          printingCostCents: 82300,
          partnerAmountCents: 100000,
          label: "Printing",
        },
        {
          sourceQuoteId: "print-2",
          currency: "USD",
          quantity: 2000,
          printingCostCents: 123456,
          partnerAmountCents: 150000,
          label: "Printing",
        },
      ],
    } as BudgetPresentation,
  };
  const sourceFingerprint = budgetApprovalFingerprint(
    state.data.settings,
    state.data.items,
    state.data.presentation,
  );
  const quote: PartnerQuotationDTO = {
    id: "share",
    partnerId: null,
    title: "Translation share",
    partnerName: "Translation partner",
    contactName: "Reviewer",
    contactEmail: "translation@example.com",
    description: "Translation only",
    currency: "USD",
    sourceFingerprint,
    printOptions: state.data.presentation!.printOptions.map((option) => ({
      ...option,
      partnerAmountCents: option.partnerAmountCents / 2,
    })),
    lines: [
      { budgetItemId: "translation", label: "Translation", amountCents: 15001 },
    ],
  };
  state.quotes = [quote];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    (await buildAllocatedQuotationBuffer(
      "project",
      "Book",
      "share",
    )) as unknown as ArrayBuffer,
  );
  const sheet = workbook.getWorksheet("Quotation")!;
  const content = JSON.stringify(sheet.model);
  expect(content).toContain("Translation partner");
  expect(content).toContain("Translation only");
  expect(content).toContain('"result":150.01');
  expect(content).toContain('"result":650.01');
  expect(content).toContain('"result":900.01');
  expect(content).not.toContain("82300");
  expect(content).not.toContain("123456");
  expect(
    (await getPartnerQuotationContext("project", null, "share")).total,
  ).toBe(650.01);
  for (const excluded of [
    "PRIVATE",
    "OTHER PARTNER",
    "WHOLE PROJECT",
    "AUDIO OTHER SHARE",
  ])
    expect(content).not.toContain(excluded);
  await expect(
    getPartnerQuotationContext("project", null, "foreign-share"),
  ).rejects.toThrow("not found in this budget");
  state.data.items[0].partnerUnitPrice = "0.05";
  await expect(
    buildAllocatedQuotationBuffer("project", "Book", "share"),
  ).rejects.toThrow("Review and save");
});
