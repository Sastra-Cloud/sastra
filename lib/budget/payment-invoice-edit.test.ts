import fs from "node:fs";
import ts from "@typescript/typescript6";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

// Execute both real actions and their shared renderer, isolating only infrastructure.
const source = fs.readFileSync("lib/budget/actions.ts", "utf8");
const block = source.slice(source.indexOf("const mouTriggerSchema"), source.indexOf("const markPaymentPaidSchema"));
const compiled = ts.transpileModule(block.replaceAll("export async", "async"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
type Row = Record<string, unknown>;
let state: Record<string, Row>;
let failInvoiceWrite: boolean;
const guard = vi.fn(), pdf = vi.fn(), upload = vi.fn(), number = vi.fn();
let update: (id: string, input: object) => Promise<{ error?: string; invoice?: object }>;
const invoiceId = "00000000-0000-4000-8000-000000000001";
const fileId = "00000000-0000-4000-8000-000000000002";
const input = { amount: 125, trigger: "on_completion", dueDate: "2026-12-01", invoiceIssueDate: "2026-11-15", invoiceDueDate: "2026-12-15",
  notes: "Planning note", publicDescription: "Second and final production payment", invoiceAssigneeId: "new-owner",
  invoiceVersion: { invoiceId, fileId } };
beforeEach(() => {
  vi.clearAllMocks(); failInvoiceWrite = false;
  state = {
    mouPayments: { id: "payment", projectId: "project", projectTitle: "Book", projectSlug: "book", amount: "100.00", currency: "USD", trigger: "custom", dueDate: "2026-11-30", notes: "Old note", publicDescription: "Old description", paidAt: null,
      sharedMouGroupId: null, printRunId: null, fundingBasis: null, proposalId: null, partnerName: "Partner", invoiceAssigneeId: "owner", invoiceTaskId: "task", invoiceId },
    invoices: { id: invoiceId, invoiceNumber: "00270", renderedFileId: fileId, sourceFileId: null, status: "issued", amount: "100.00", currency: "USD", issueDate: "2026-11-14", dueDate: "2026-11-30", description: "Old description", recipientName: "Partner", recipientEmail: "partner@example.org", recipientAddress: "Saved address" },
    tasks: { id: "task", assignedTo: "owner" },
  };
  const query = (rows: Row[]) => {
    const q = { from: () => q, innerJoin: () => q, leftJoin: () => q, where: () => q, orderBy: () => q,
      limit: async () => rows, for: async () => rows, then: (yes: (rows: Row[]) => unknown) => Promise.resolve(rows).then(yes) };
    return q;
  };
  const selects = [[state.mouPayments], [state.mouPayments], [state.invoices], []];
  const db = {
    select: () => query(selects.shift() ?? []),
    transaction: async (work: (tx: object) => Promise<unknown>) => {
      const staged = structuredClone(state);
      const tx = {
        select: () => ({ from: (table: string) => query(staged[table] ? [staged[table]] : []) }),
        insert: () => ({ values: async () => {} }),
        update: (table: string) => ({ set: (fields: Row) => ({ where: () => {
          if (table === "invoices" && failInvoiceWrite) throw new Error("Invoice write failed");
          const rows = table === "mouPayments" && staged[table].paidAt ? [] : [staged[table]];
          if (rows.length) Object.assign(staged[table], fields);
          return { returning: async () => rows, then: (yes: (rows: Row[]) => unknown) => Promise.resolve(rows).then(yes) };
        } }) }),
      };
      const result = await work(tx); state = staged; return result;
    },
  };
  guard.mockResolvedValue({ user: { id: "manager" } }); pdf.mockResolvedValue(Buffer.from("PDF")); upload.mockResolvedValue(undefined);
  const deps: Record<string, unknown> = { z, db, requireRole: guard, buildInvoicePdf: pdf, putObject: upload, nextInvoiceNumber: number,
    getOrCreateBudgetSettings: vi.fn().mockResolvedValue({}), getWorkspaceSettings: vi.fn().mockResolvedValue({}), getInvoiceIssuerSnapshot: () => ({ legalName: "Issuer", contactEmail: "issuer@example.org", paymentInstructions: "Bank transfer" }),
    mouInvoiceTaskCopy: (next: Row) => ({ title: "Invoice task", description: next.publicDescription }), taskAssignmentFields: () => ({}),
    todayIso: () => "2026-11-14", randomUUID: () => "new-file", buildKey: () => "key", logActivity: vi.fn(), revalidate: vi.fn(), notify: vi.fn() };
  for (const name of ["mouPayments", "invoices", "projects", "tasks", "files", "activityLog", "sharedMouGroups"]) deps[name] = name;
  for (const name of ["eq", "ne", "and", "desc", "isNull"]) deps[name] = vi.fn();
  update = new Function(...Object.keys(deps), compiled + "\nreturn updatePayment;")(...Object.values(deps));
});

it("saves the full payment, task, and unsent invoice dates and amount together, preserving the invoice number", async () => {
  expect(await update("payment", input)).toHaveProperty("invoice.invoiceNumber", "00270");
  expect(state.mouPayments).toMatchObject({ amount: "125.00", dueDate: "2026-12-01", trigger: "on_completion", notes: "Planning note", invoiceAssigneeId: "new-owner" });
  expect(state.invoices).toMatchObject({ id: invoiceId, invoiceNumber: "00270", amount: "125.00", issueDate: "2026-11-15", dueDate: "2026-12-15", description: input.publicDescription, renderedFileId: "new-file" });
  expect(state.tasks).toMatchObject({ assignedTo: "new-owner", description: input.publicDescription });
  expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ amount: 125, invoiceNumber: "00270", issueDate: "2026-11-15", dueDate: "2026-12-15" }));
  expect(number).not.toHaveBeenCalled();
});
it("keeps the payment, task, and invoice unchanged when the replacement PDF upload fails", async () => {
  const previous = structuredClone(state);
  upload.mockRejectedValue(new Error("Storage unavailable"));
  await expect(update("payment", input)).rejects.toThrow("Storage unavailable");
  expect(state).toEqual(previous);
});
it("does not save payment changes if sending starts while its PDF is being prepared", async () => {
  const previous = structuredClone(state);
  pdf.mockImplementation(async () => { state.invoices.status = "sending"; return Buffer.from("PDF"); });
  expect((await update("payment", input)).error).toContain("changed");
  expect(state.mouPayments).toEqual(previous.mouPayments);
  expect(state.tasks).toEqual(previous.tasks);
  expect(state.invoices.renderedFileId).toBe(fileId);
});
it("rejects already-sent invoices before touching their schedule or generating a PDF", async () => {
  state.invoices.status = "sent";
  const previous = structuredClone(state);
  expect((await update("payment", input)).error).toContain("unsent");
  expect(pdf).not.toHaveBeenCalled(); expect(state).toEqual(previous);
});
it("requires a manager before reading or editing the payment", async () => {
  guard.mockRejectedValue(new Error("Forbidden"));
  await expect(update("payment", input)).rejects.toThrow("Forbidden"); expect(pdf).not.toHaveBeenCalled();
});

it("rolls back payment and task changes if the final invoice write fails", async () => {
  failInvoiceWrite = true; const previous = structuredClone(state);
  await expect(update("payment", input)).rejects.toThrow("Invoice write failed");
  expect(state).toEqual(previous);
});
