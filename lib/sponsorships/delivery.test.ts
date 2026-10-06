import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";
import { beforeEach, expect, it, vi } from "vitest";

// Exercise the shared delivery action's finance boundary without calling a provider.
const source = readFileSync(new URL("../budget/actions.ts", import.meta.url), "utf8");
const action = source.slice(source.indexOf("const sendInvoiceSchema"), source.indexOf("export async function deletePayment"));
const compiled = ts.transpileModule(action.replace("export async", "async"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const fileId = "00000000-0000-4000-8000-000000000001";
let invoice: Record<string, unknown>;
let send: (id: string, input: unknown) => Promise<{ error?: string }>;
const provider = vi.fn();
const moduleGuard = vi.fn();
const select = vi.fn();
const input = { confirmed: true, reviewedFileId: fileId, recipientEmail: "partner@example.test", ccEmails: ["finance@example.test"], subject: "Invoice", body: "Reviewed message" };
beforeEach(() => {
  vi.clearAllMocks();
  invoice = { sponsorshipId: "sponsorship", status: "issued", renderedFileId: fileId };
  moduleGuard.mockResolvedValue({});
  select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [invoice] }) }) }));
  const deps = { z, requireRole: vi.fn().mockResolvedValue({ user: { id: "manager" } }), requireWorkspaceModule: moduleGuard,
    invoices: {}, eq: vi.fn(), db: { select }, sendEmail: provider };
  send = new Function(...Object.keys(deps), compiled + "\nreturn sendInvoiceEmail;")(...Object.values(deps));
});
it("requires explicit confirmation before reading an invoice or sending", async () => {
  await expect(send("invoice", { ...input, confirmed: false })).rejects.toThrow();
  expect(select).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
});
it("requires review of the current sponsorship PDF", async () => {
  expect((await send("invoice", { ...input, reviewedFileId: undefined })).error).toContain("review");
  expect(provider).not.toHaveBeenCalled();
});
it("blocks delivery when sponsorships is disabled", async () => {
  moduleGuard.mockRejectedValue(new Error("Module disabled"));
  await expect(send("invoice", input)).rejects.toThrow("Module disabled");
  expect(provider).not.toHaveBeenCalled();
});
for (const status of ["sending", "sent", "received", "void"]) {
  it(`never resends an invoice with ${status} status`, async () => {
    invoice.status = status;
    expect((await send("invoice", input)).error).toBeTruthy();
    expect(provider).not.toHaveBeenCalled();
  });
}
