import { expect, it, vi } from "vitest";
const select = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { select } }));
import { getInvoiceIssuerSnapshot, getWorkspaceSettings, type WorkspaceSettings } from "./queries";
const settings = { orgName: "Workspace", legalName: "Legal organization", invoicePaymentDetails: null } as WorkspaceSettings;
it("uses a separate issuer name without changing workspace identity", () => {
  const configured = { ...settings, invoicePaymentDetails: { issuerName: " Invoice issuer ", title: "", fields: [] } };
  expect(getInvoiceIssuerSnapshot(configured).legalName).toBe("Invoice issuer");
  expect(configured.legalName).toBe("Legal organization");
  expect(getInvoiceIssuerSnapshot(configured).orgName).toBe("Workspace");
});
it("preserves the existing naming fallback for absent or blank overrides", () => {
  expect(getInvoiceIssuerSnapshot(settings).legalName).toBe("Legal organization");
  expect(getInvoiceIssuerSnapshot({ ...settings, invoicePaymentDetails: { issuerName: "  ", title: "", fields: [] } }).legalName).toBe("Legal organization");
  const snapshot = getInvoiceIssuerSnapshot({ ...settings, legalName: null });
  expect(snapshot.legalName || snapshot.orgName).toBe("Workspace");
});
it("reads current invoice identity on each non-render request after a settings change", async () => {
  let current = settings;
  select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: async () => [current] }) }) }));
  expect(getInvoiceIssuerSnapshot(await getWorkspaceSettings()).legalName).toBe("Legal organization");
  current = { ...settings, invoicePaymentDetails: { issuerName: "Updated issuer", title: "", fields: [] } };
  expect(getInvoiceIssuerSnapshot(await getWorkspaceSettings()).legalName).toBe("Updated issuer");
});
