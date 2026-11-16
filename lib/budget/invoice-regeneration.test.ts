import fs from "node:fs";
import ts from "@typescript/typescript6";
import { beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";

// Exercise the actual server action with isolated infrastructure dependencies.
const source = fs.readFileSync("lib/budget/actions.ts", "utf8");
const action = source.slice(source.indexOf("export async function generateMouInvoice("), source.indexOf("const markPaymentPaidSchema"));
const compiled = ts.transpileModule(action.replace("export async", "async"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let existing: Record<string, unknown>;
let current: Record<string, unknown>;
let pdf: ReturnType<typeof vi.fn>;
let upload: ReturnType<typeof vi.fn>;
let update = vi.fn<(value: unknown) => void>();
let nextNumber: ReturnType<typeof vi.fn>;
let auth: ReturnType<typeof vi.fn>;
let generate: (id: string, options: object) => Promise<{ error?: string; invoiceId?: string }>;
let payment: Record<string, unknown>;
let details: ReturnType<typeof vi.fn>;
beforeEach(() => {
  existing = { id: "invoice", invoiceNumber: "00267", status: "issued", renderedFileId: "old-file", sourceFileId: null,
    issueDate: "2026-09-09", dueDate: null, amount: "6094.69", currency: "USD" };
  current = existing;
  pdf = vi.fn().mockResolvedValue(Buffer.from("pdf")); upload = vi.fn().mockResolvedValue(undefined);
  update = vi.fn(); nextNumber = vi.fn(); auth = vi.fn().mockResolvedValue({ user: { id: "manager" } });
  payment = { id: "payment", projectId: "project", sharedMouGroupId: "group", amount: "9999.00", currency: "EUR", trigger: "on_signing" };
  details = vi.fn().mockResolvedValue({ recipientName: "Partner", billingAddress: "Address", description: "Covered work" });
  const rows = [() => [payment], () => (existing ? [existing] : []), () => [], () => [{ title: "Work" }]];
  function query(value: () => unknown) {
    const q = { from: () => q, innerJoin: () => q, leftJoin: () => q, where: () => q, orderBy: () => q, for: () => Promise.resolve(value()), limit: () => Promise.resolve(value()), then: (resolve: (value: unknown) => unknown) => Promise.resolve(value()).then(resolve) };
    return q;
  }
  const tx = { select: () => query(() => [current]), insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }),
    update: () => ({ set: (value: unknown) => { update(value); return { where: vi.fn().mockResolvedValue(undefined) }; } }) };
  const deps: Record<string, unknown> = {
    z, requireRole: auth, db: { select: () => query(rows.shift()!), transaction: (work: (tx: unknown) => unknown) => work(tx) },
    getSharedPaymentReadiness: vi.fn().mockResolvedValue({ status: "invoiced" }),
    getOrCreateBudgetSettings: vi.fn().mockResolvedValue({}), getWorkspaceSettings: vi.fn().mockResolvedValue({}),
    getInvoiceIssuerSnapshot: () => ({ legalName: "Issuer", contactEmail: "issuer@example.org", paymentInstructions: "Bank transfer" }),
    getMouInvoiceDetails: details,
    findOrCreatePartnerContact: vi.fn().mockResolvedValue({ partnerId: "partner", partnerContactId: "contact" }),
    todayIso: () => "2026-10-10", nextInvoiceNumber: nextNumber, buildInvoicePdf: pdf, randomUUID: () => "new-file",
    buildKey: () => "key", putObject: upload, logActivity: vi.fn(), reevaluateSharedMouPayments: vi.fn(), revalidatePath: vi.fn(), revalidate: vi.fn(),
  };
  for (const name of ["mouPayments", "projects", "sharedMouGroups", "invoices", "sharedMouMemberships", "files", "activityLog"]) deps[name] = {};
  for (const name of ["eq", "ne", "and", "desc"]) deps[name] = vi.fn();
  generate = new Function(...Object.keys(deps), compiled + "\nreturn generateMouInvoice;")(...Object.values(deps));
});
it("refreshes the file and audited details without changing invoice identity or financial terms", async () => {
  expect(await generate("payment", { regenerate: true, description: "Reviewed work", billingAddress: "Reviewed address" })).toEqual({ invoiceId: "invoice", invoiceNumber: "00267" });
  expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ invoiceNumber: "00267", amount: 6094.69, currency: "USD", issueDate: "2026-09-09", dueDate: null, description: "Reviewed work", recipientAddress: "Reviewed address" }));
  expect(nextNumber).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ renderedFileId: "new-file" }));
  expect(update.mock.calls[0][0]).not.toHaveProperty("amount");
  expect(update.mock.calls[0][0]).not.toHaveProperty("invoiceNumber");
});
for (const status of ["sent", "sending", "void", "received"]) it(`rejects ${status} invoices before rendering`, async () => {
  existing.status = status;
  expect((await generate("payment", { regenerate: true })).error).toBeTruthy();
  expect(pdf).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it("leaves the current invoice untouched when upload fails", async () => {
  upload.mockRejectedValue(new Error("Upload failed"));
  await expect(generate("payment", { regenerate: true })).rejects.toThrow("Upload failed");
  expect(update).not.toHaveBeenCalled();
});
it("does not overwrite a concurrent send or regeneration", async () => {
  current = { ...existing, renderedFileId: "newer-file" };
  expect((await generate("payment", { regenerate: true })).error).toContain("changed");
  expect(update).not.toHaveBeenCalled();
});
it("refreshes an unsent project invoice with the saved partner's current name, address, and email", async () => {
  payment.sharedMouGroupId = null;
  existing.recipientName = "Previous partner";
  existing.recipientEmail = "previous@example.org";
  details.mockResolvedValue({ recipientName: "New partner", billingAddress: "Saved partner address", description: "Project funding", contactEmail: "new@example.org" });
  expect(await generate("payment", { regenerate: true })).toEqual({ invoiceId: "invoice", invoiceNumber: "00267" });
  expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ invoiceNumber: "00267", recipientName: "New partner", recipientAddress: "Saved partner address", recipientEmail: "new@example.org", amount: 6094.69 }));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ recipientName: "New partner", recipientAddress: "Saved partner address", recipientEmail: "new@example.org" }));
  expect(nextNumber).not.toHaveBeenCalled();
});
it("regenerates an unsent project invoice whose recipient is blank, keeping its number and amount", async () => {
  payment.sharedMouGroupId = null;
  existing.recipientName = null; existing.recipientEmail = null;
  details.mockResolvedValue({ recipientName: "Partner", billingAddress: "Address", description: "Covered work", contactEmail: "partner@example.org" });
  expect(await generate("payment", { regenerate: true })).toEqual({ invoiceId: "invoice", invoiceNumber: "00267" });
  expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ invoiceNumber: "00267", amount: 6094.69, recipientName: "Partner" }));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ recipientName: "Partner", recipientEmail: "partner@example.org" }));
  expect(nextNumber).not.toHaveBeenCalled();
});
it("does not issue an invoice number when nobody can be billed", async () => {
  payment.sharedMouGroupId = null;
  existing = undefined as unknown as Record<string, unknown>;
  details.mockResolvedValue({ recipientName: null, billingAddress: "", description: "Covered work" });
  expect((await generate("payment", {})).error).toContain("Add the funding partner");
  expect(nextNumber).not.toHaveBeenCalled(); expect(pdf).not.toHaveBeenCalled();
});
it("requires manager authorization", async () => {
  auth.mockRejectedValue(new Error("Forbidden"));
  await expect(generate("payment", { regenerate: true })).rejects.toThrow("Forbidden");
  expect(pdf).not.toHaveBeenCalled();
});

it("rejects imported invoices", async () => {
  existing.sourceFileId = "imported-file";
  expect((await generate("payment", { regenerate: true })).error).toBeTruthy();
  expect(pdf).not.toHaveBeenCalled();
});
it("does not replace a PDF after sending starts", async () => {
  current = { ...existing, status: "sending" };
  expect((await generate("payment", { regenerate: true })).error).toBeTruthy();
  expect(update).not.toHaveBeenCalled();
});

it("rejects sending when the reviewed PDF has been regenerated", async () => {
  const sendSource = source.slice(source.indexOf("const sendInvoiceSchema"), source.indexOf("export async function deletePayment"));
  const sendCompiled = ts.transpileModule(sendSource.replace("export async", "async"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sendEmail = vi.fn();
  const deps = { z, requireRole: auth, invoices: {}, eq: vi.fn(), sendEmail,
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "invoice", groupId: null, status: "issued", renderedFileId: "new-file" }] }) }) }) } };
  const send = new Function(...Object.keys(deps), sendCompiled + "\nreturn sendInvoiceEmail;")(...Object.values(deps));
  expect(await send("invoice", { confirmed: true, reviewedFileId: "00000000-0000-4000-8000-000000000001", recipientEmail: "partner@example.org", subject: "Invoice", body: "Attached" }))
    .toEqual({ error: "The invoice PDF changed. Refresh and review it before sending." });
  expect(sendEmail).not.toHaveBeenCalled();
});

it("edits the exact unsent invoice description without changing its billing snapshot or financial terms", async () => {
  const invoiceId = "00000000-0000-4000-8000-000000000001";
  const fileId = "00000000-0000-4000-8000-000000000002";
  Object.assign(existing, { id: invoiceId, renderedFileId: fileId, recipientName: "Original partner",
    recipientEmail: "original@example.org", recipientAddress: "Original address", description: "Previous wording",
    issuerSnapshot: { legalName: "Original issuer", contactEmail: "issuer@example.org", paymentInstructions: "Bank transfer" } });
  const result = await generate("payment", { regenerate: true, description: "Translation and audiobook production", editDescription: { invoiceId, fileId } });
  expect(result).toMatchObject({ invoiceId, invoiceNumber: "00267", description: "Translation and audiobook production", file: { id: "new-file" } });
  expect(pdf).toHaveBeenCalledWith(expect.objectContaining({ recipientName: "Original partner", recipientEmail: "original@example.org", recipientAddress: "Original address", issuer: existing.issuerSnapshot,
    description: "Translation and audiobook production", amount: 6094.69, currency: "USD", issueDate: "2026-09-09", dueDate: null }));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ description: "Translation and audiobook production", renderedFileId: "new-file" }));
  expect(nextNumber).not.toHaveBeenCalled();
  expect(details).not.toHaveBeenCalled();
});

it("rejects a description saved from an older invoice PDF before rendering a replacement", async () => {
  Object.assign(existing, { id: "00000000-0000-4000-8000-000000000001", renderedFileId: "newer-file" });
  expect((await generate("payment", { regenerate: true, description: "My edits", editDescription: {
    invoiceId: String(existing.id), fileId: "00000000-0000-4000-8000-000000000002",
  } })).error).toContain("invoice changed");
  expect(pdf).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
