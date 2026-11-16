// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), generate: vi.fn(), refresh: vi.fn(), confirm: vi.fn(), voidInvoice: vi.fn() }));
vi.mock("@/lib/dialog-requests", () => ({ confirmDialog: mocks.confirm }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/budget/actions", () => ({
  addPayment: vi.fn(), deletePayment: vi.fn(), generateMouInvoice: mocks.generate,
  updatePayment: mocks.update, markPaymentPaid: vi.fn(), markPaymentUnpaid: vi.fn(),
  requestMouInvoice: vi.fn(), splitFundingIntoTwoPayments: vi.fn(), sendInvoiceEmail: vi.fn(), voidMouInvoice: mocks.voidInvoice,
}));
vi.mock("./invoice-import-button", () => ({ InvoiceImportButton: () => null }));
vi.mock("@/lib/email/draft-actions", () => ({ discardEmailDraft: vi.fn(), saveEmailDraft: vi.fn() }));
import { MouPayments, type Payment } from "./mou-payments";

const payment: Payment = {
  id: "final", printRunId: null, amount: "0.00", currency: "USD", trigger: "custom",
  dueDate: "2026-11-14", notes: "Remaining 50% of the Total Payment to Licensee due on completion",
  publicDescription: "Final production installment", invoiceAssigneeId: null, invoiceTaskId: null,
  invoiceRequestedAt: null, paidAt: null, invoice: null, invoiceHistory: [],
};
const props = {
  projectId: "project", projectTitle: "Test book", emailIdentity: { senderName: "Manager", organizationName: "Workspace" },
  currency: "USD", canEdit: true, payments: [payment], assignees: [], projectStatus: "active",
  fundingTarget: 21670.56, defaultCcEmails: [], initialEmailDrafts: [], unlinkedReceivedAmount: 10835.28,
};
let root: Root;
let container: HTMLDivElement;
function button(text: string) {
  const result = [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === text);
  if (!result) throw new Error(`Button not found: ${text}`);
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("prefills the percentage, saves the reviewed amount before generation, and prevents duplicate submissions", async () => {
  let save!: (value: object) => void;
  let generate!: (value: object) => void;
  mocks.update.mockReturnValue(new Promise((resolve) => { save = resolve; }));
  mocks.generate.mockReturnValue(new Promise((resolve) => { generate = resolve; }));
  await act(() => root.render(<MouPayments {...props} />));
  expect(container.textContent).toContain("10,835.28");
  await act(() => button("Review & invoice").click());
  expect(container.textContent).toContain("already recorded outside this payment schedule");
  expect(container.querySelector<HTMLInputElement>('input[id$="-amount"]')?.value).toBe("10835.28");
  expect(container.querySelector<HTMLInputElement>('input[id$="-percentage"]')?.value).toBe("50");
  const percentage = container.querySelector<HTMLInputElement>('input[id$="-percentage"]')!;
  const changePercentage = (value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(percentage, value);
    percentage.dispatchEvent(new Event("input", { bubbles: true }));
  };
  await act(() => changePercentage("25"));
  expect(container.querySelector<HTMLInputElement>('input[id$="-amount"]')?.value).toBe("5417.64");
  await act(() => changePercentage("101"));
  expect(button("Save & generate invoice").disabled).toBe(true);
  await act(() => changePercentage("50"));
  await act(() => { button("Save & generate invoice").click(); button("Save & generate invoice").click(); });
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.update.mock.calls[0]).toMatchObject(["final", { amount: 10835.28, publicDescription: "Final production installment" }]);
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(button("Preparing invoice…").disabled).toBe(true);
  await act(() => save({}));
  expect(mocks.generate).toHaveBeenCalledWith("final");
  expect(button("Preparing invoice…").disabled).toBe(true);
  await act(() => generate({ invoiceId: "invoice", invoiceNumber: "001" }));
  expect(container.querySelector('input[id$="-amount"]')).toBeNull();
  expect(mocks.refresh).toHaveBeenCalled();
});

it.each(["save", "invoice"])("keeps the entered amount available after %s failure", async (stage) => {
  mocks.update.mockResolvedValue(stage === "save" ? { error: "Could not save. Try again." } : {});
  mocks.generate.mockResolvedValue({ error: "Storage unavailable. Try again." });
  await act(() => root.render(<MouPayments {...props} />));
  await act(() => button("Review & invoice").click());
  await act(() => button("Save & generate invoice").click());
  expect(container.querySelector<HTMLInputElement>('input[id$="-amount"]')?.value).toBe("10835.28");
  expect(button("Save & generate invoice").disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(stage === "save" ? "Could not save" : "Payment saved. Invoice could not be generated.");
  if (stage === "save") expect(mocks.generate).not.toHaveBeenCalled();
  else expect(mocks.generate).toHaveBeenCalledOnce();
});

it("routes a fee payable to the licensor to review instead of creating an incoming invoice", async () => {
  await act(() => root.render(<MouPayments {...props} rightsHref="/projects/test-book/rights" payments={[
    { ...payment, amount: "675.00", notes: "Administration Fee to the Licensor" },
  ]} />));
  await act(() => button("Review fee").click());
  expect([...container.querySelectorAll("button")].some(node => node.textContent === "Save & generate invoice")).toBe(false);
  expect(container.querySelector('a[href="/projects/test-book/rights"]')).not.toBeNull();
  expect(mocks.generate).not.toHaveBeenCalled();
});

it("keeps the full unpaid payment editor available and saves its dates and invoice together with failure recovery", async () => {
  const invoiceId = "00000000-0000-4000-8000-000000000001";
  const fileId = "00000000-0000-4000-8000-000000000002";
  const invoicePayment: Payment = { ...payment, amount: "100.00", invoice: { id: invoiceId, invoiceNumber: "00270", recipientName: "Partner", recipientEmail: "partner@example.org",
    description: "Original description\nCovered work", issueDate: "2026-11-14", dueDate: "2026-11-30", status: "issued", generated: true,
    file: { id: fileId, originalName: "invoice-00270.pdf", mimeType: "application/pdf", sizeBytes: 100 } } };
  let resolve!: (value: object) => void;
  mocks.update.mockImplementation(() => new Promise((yes) => { resolve = yes; }));
  await act(() => root.render(<MouPayments {...props} payments={[invoicePayment]} />));
  await act(() => button("Review & send").click());
  const reviewed = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(() => reviewed.click());
  expect(reviewed.checked).toBe(true);
  await act(() => button("Edit payment").click());
  const input = container.querySelector<HTMLTextAreaElement>('textarea[id$="-description"]')!;
  expect(input.value).toBe("Original description\nCovered work");
  expect(container.querySelector('input[id$="-amount"]')).not.toBeNull();
  expect(container.querySelector<HTMLInputElement>('input[id$="-date"]')?.value).toBe("2026-11-14");
  expect(container.querySelector<HTMLInputElement>('input[id$="-invoice-date"]')?.value).toBe("2026-11-14");
  expect(container.querySelector<HTMLInputElement>('input[id$="-invoice-due"]')?.value).toBe("2026-11-30");
  await act(() => {
    const due = container.querySelector<HTMLInputElement>('input[id$="-invoice-due"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(due, "2026-12-15");
    due.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Translation and audiobook production");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => { button("Save payment & refresh invoice").click(); button("Save payment & refresh invoice").click(); });
  expect(mocks.generate).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledWith("final", expect.objectContaining({ publicDescription: "Translation and audiobook production", invoiceVersion: { invoiceId, fileId }, invoiceDueDate: "2026-12-15", invoiceIssueDate: "2026-11-14" }));
  expect(button("Updating payment & invoice…").disabled).toBe(true);
  await act(() => resolve({ error: "Storage unavailable" }));
  expect(input.value).toBe("Translation and audiobook production");
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Storage unavailable");
  await act(() => button("Save payment & refresh invoice").click());
  await act(() => resolve({ invoice: { invoiceId, invoiceNumber: "00270", description: "Translation and audiobook production",
    file: { id: "new-file", originalName: "invoice-00270.pdf", mimeType: "application/pdf", sizeBytes: 150 } } }));
  expect(container.querySelector('textarea[id$="-description"]')).toBeNull();
  expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
  expect(mocks.refresh).toHaveBeenCalled();
});

it("keeps sent invoice PDFs out of the description editor", async () => {
  await act(() => root.render(<MouPayments {...props} payments={[{ ...payment, amount: "100.00", invoice: {
    id: "invoice", invoiceNumber: "00270", recipientEmail: "partner@example.org", description: "Sent wording", status: "sent", generated: true,
    file: { id: "file", originalName: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 100 },
  } }]} />));
  expect(container.querySelector('[aria-label="Edit invoice description"]')).toBeNull();
  expect([...container.querySelectorAll('button')].some((node) => node.textContent?.includes("Edit invoice description"))).toBe(false);
});

it("keeps voiding in More and requires confirmation before changing the invoice", async () => {
  mocks.confirm.mockResolvedValue(false);
  await act(() => root.render(<MouPayments {...props} fundingPartner={{ name: "Partner", email: "partner@example.org" }} payments={[{ ...payment, amount: "100.00", invoice: {
    id: "invoice", invoiceNumber: "00270", recipientEmail: "partner@example.org", status: "issued", generated: true,
    file: { id: "file", originalName: "invoice.pdf", mimeType: "application/pdf", sizeBytes: 100 },
  } }]} />));
  expect([...container.querySelectorAll('button')].some((node) => node.textContent === "Void invoice")).toBe(false);
  const more = container.querySelector<HTMLButtonElement>('[aria-label="More actions for invoice 00270"]')!;
  await act(() => more.click());
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) => node.textContent?.includes("Void invoice"))!;
  expect(item).toBeDefined();
  await act(() => item.click());
  expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("00270"));
  expect(mocks.voidInvoice).not.toHaveBeenCalled();
});
