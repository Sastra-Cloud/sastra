// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ confirm: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/dialog-requests", () => ({ confirmDialog: mocks.confirm }));
vi.mock("@/lib/budget/partner-quotation-actions", () => ({
  savePartnerQuotation: vi.fn(),
  deletePartnerQuotation: vi.fn(),
}));
vi.mock("./proposal-panel", () => ({ ProposalPanel: () => null }));
vi.mock("./budget-approval-panel", () => ({ BudgetApprovalPanel: () => null }));

import { PartnerQuotationsPanel } from "./partner-quotations-panel";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.confirm.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// Without attribution, managers can mistake a draft's reserved printing share
// for funded work, or abandon their current form while trying to recover it.
it("explains reserved print options and safely opens the quotation that uses them", async () => {
  const printOptions = [100000, 150000, 200000].map((partnerAmountCents, i) => ({
    sourceQuoteId: `print-${i}`,
    quantity: (i + 1) * 1000,
    currency: "USD",
    printingCostCents: partnerAmountCents / 2,
    partnerAmountCents,
    label: "Printing",
  }));
  const props: ComponentProps<typeof PartnerQuotationsPanel> = {
    projectId: "project",
    projectSlug: "book",
    printRunId: null,
    currency: "USD",
    sourceFingerprint: "current",
    items: [{
      id: "audio",
      category: "audiobook",
      label: "Audio",
      partnerLabel: null,
      partnerVisible: true,
      partnerUnitPrice: null,
      unit: "flat",
      quantity: "1",
      unitPrice: "200",
      amount: "200",
    }],
    printOptions,
    quotations: [{
      id: "saved",
      title: "Book printing",
      partnerId: "other-partner",
      partnerName: "Example partner",
      contactName: "",
      contactEmail: "",
      description: "",
      currency: "USD",
      sourceFingerprint: "old",
      lines: [{ budgetItemId: "audio", label: "Audio", amountCents: 10000 }],
      printOptions,
    }],
    partners: [{ id: "other-partner", name: "Other partner", contacts: [] }],
    approvalStates: {},
    approvalContext: {
      currentUserId: "manager",
      eligibleApprovers: [],
      todayIso: "2026-11-11",
      defaultDueDate: "2026-11-18",
    },
    proposals: [],
    emailDrafts: [],
    approvalRequired: false,
    approvalCanSend: true,
    approvalGateReason: null,
    proposedCompletionDate: null,
    realCompletionDeadline: null,
  };
  await act(() => root.render(<PartnerQuotationsPanel {...props} />));
  const start = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.includes("Start a proposal"),
  )!;
  await act(() => start.click());
  const fullForm = [...document.querySelectorAll("button")].find(
    (button) => button.textContent?.includes("Show the full form"),
  )!;
  await act(() => fullForm.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Assigned does not mean funded.");
  const printing = dialog.querySelector('[id="share-print-0"]')!;
  expect(printing.hasAttribute("disabled") || printing.hasAttribute("data-disabled")).toBe(true);
  expect(printing.closest("label")?.textContent ?? printing.parentElement?.textContent).toContain("Fully assigned");
  const assignment = dialog.querySelector('[id="assigned-print-0"]')!;
  expect(assignment.textContent).toContain("Book printing");
  expect(assignment.textContent).toContain("Example partner");
  expect(assignment.textContent).toContain("1,000.00");
  expect(dialog.querySelector<HTMLInputElement>('[aria-label="Audio share (USD)"]')?.value).toBe("100.00");

  const edit = assignment.querySelector("button")!;
  mocks.confirm.mockResolvedValueOnce(false);
  await act(() => edit.click());
  expect(dialog.querySelector<HTMLInputElement>('[aria-label="Audio share (USD)"]')?.value).toBe("100.00");
  expect(dialog.querySelector('[aria-label="Printing · 1,000 copies share (USD)"]')).toBeNull();

  mocks.confirm.mockResolvedValueOnce(true);
  await act(() => edit.click());
  expect(mocks.confirm).toHaveBeenCalledWith(
    expect.stringContaining("without saving"),
    expect.objectContaining({ confirmLabel: "Open quotation" }),
  );
  expect(dialog.querySelector<HTMLInputElement>("#quotation-title")?.value).toBe("Book printing");
  expect(dialog.querySelector<HTMLSelectElement>("#quotation-directory")?.value).toBe("");
  expect(dialog.querySelector('[id="assigned-print-0"]')).toBeNull();
  for (const option of printOptions) {
    expect(dialog.querySelector<HTMLInputElement>(`[aria-label="Printing · ${option.quantity.toLocaleString()} copies share (USD)"]`)?.value).toBe((option.partnerAmountCents / 100).toFixed(2));
  }
});
