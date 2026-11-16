import fs from "node:fs";
import ts from "@typescript/typescript6";
import { z } from "zod";
import { beforeEach, expect, it, vi } from "vitest";

// Exercise the actual settings action while isolating its unrelated budget infrastructure.
const source = fs.readFileSync("lib/budget/actions.ts", "utf8");
const block = source.slice(source.indexOf("const settingsSchema ="), source.indexOf("const lineSchema ="));
const compiled = ts.transpileModule(block.replace("export async", "async"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const guard = vi.fn();
const link = vi.fn();
const refreshInvoices = vi.fn();
let settings: Record<string, unknown>;
let update: (projectId: string, fields: object) => Promise<void>;
beforeEach(() => {
  vi.clearAllMocks();
  settings = { partnerName: "Old partner", partnerId: "old", partnerContactId: "old-contact", partnerContactFirstName: "Old", partnerContactLastName: "Contact", partnerContactEmail: "old@example.org" };
  guard.mockResolvedValue({ user: { id: "manager" } });
  refreshInvoices.mockResolvedValue(null);
  link.mockResolvedValue({ partnerId: "saved-partner", partnerContactId: "saved-contact" });
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => [settings] }) }) }),
    update: () => ({ set: (fields: object) => ({ where: async () => { settings = { ...settings, ...fields }; } }) }),
  };
  const deps = { z, rate: z.number(), requireRole: guard, db: { transaction: (run: (tx: unknown) => unknown) => run(tx) },
    getOrCreateBudgetSettings: vi.fn(), projectBudgetSettings: {}, eq: vi.fn(), findOrCreatePartnerContact: link,
    refreshFundingPartnerInvoices: refreshInvoices, recomputeProjectLines: vi.fn(), logActivity: vi.fn(), revalidate: vi.fn(), revalidatePath: vi.fn() };
  update = new Function(...Object.keys(deps), compiled + "\nreturn updateBudgetSettings;")(...Object.values(deps));
});

it("saves a typed billing partner and all entered directory details with the canonical project link", async () => {
  const details = { website: "https://example.org", billingAddress: "123 Main St", notes: "Notes", phone: "5550100", role: "Director" };
  await update("project", { partnerId: "old", partnerContactId: "old-contact", partnerName: " New partner ",
    partnerContactFirstName: "Alex", partnerContactLastName: "Example", partnerContactEmail: "alex@example.org", partnerDetails: details });
  expect(link).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ org: "New partner", firstName: "Alex", lastName: "Example", email: "alex@example.org", ...details, createdBy: "manager" }));
  expect(settings).toMatchObject({ partnerName: "New partner", partnerId: "saved-partner", partnerContactId: "saved-contact" });
  expect(refreshInvoices).toHaveBeenCalledWith("project");
});

it("keeps project settings unchanged when the directory write fails", async () => {
  link.mockRejectedValue(new Error("Write failed"));
  const previous = { ...settings };
  await expect(update("project", { partnerName: "New partner" })).rejects.toThrow("Write failed");
  expect(settings).toEqual(previous);
});

it("does not create directory entries for unrelated edits or explicit unlinking", async () => {
  await update("project", { wordCount: 40000 });
  await update("project", { partnerId: null, partnerContactId: null });
  expect(link).not.toHaveBeenCalled();
  expect(settings).toMatchObject({ wordCount: 40000, partnerId: null, partnerContactId: null, partnerName: "Old partner" });
});

it("requires manager permission before creating a billing partner", async () => {
  guard.mockRejectedValue(new Error("Forbidden"));
  await expect(update("project", { partnerName: "New partner" })).rejects.toThrow("Forbidden");
  expect(link).not.toHaveBeenCalled();
});

it("reports invoice-refresh failure without losing the successfully saved partner", async () => {
  refreshInvoices.mockResolvedValue("Partner saved. Refresh the invoice before sending.");
  expect(await update("project", { partnerName: "New partner" })).toEqual({ invoiceRefreshError: "Partner saved. Refresh the invoice before sending." });
  expect(settings.partnerId).toBe("saved-partner");
  expect(settings.partnerContactEmail).toBeNull();
});
