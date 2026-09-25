import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
import { getInvoiceIssuerSnapshot, type WorkspaceSettings } from "./queries";
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
