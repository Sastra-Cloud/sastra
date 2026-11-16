import "server-only";

import { getBudgetData } from "@/lib/budget/queries";
import { getPartnerQuotationContext } from "./partner-quotation-context";
import { partnerBaseItems } from "./print-options";
import {
  buildQuotationWorkbook,
  type QuotationBranding,
} from "@/lib/budget/export";
import { getObjectBuffer } from "@/lib/r2";
import {
  getWorkspaceLogoFile,
  getWorkspaceSettings,
} from "@/lib/workspace/queries";

/** Load workspace branding + logo bytes for the quotation workbook. */
async function loadBranding(): Promise<QuotationBranding> {
  const settings = await getWorkspaceSettings();
  const logoFile = await getWorkspaceLogoFile();
  let logo: QuotationBranding["logo"] = null;
  if (logoFile) {
    const extension =
      logoFile.mimeType === "image/png"
        ? "png"
        : logoFile.mimeType === "image/jpeg"
          ? "jpeg"
          : null;
    if (extension) {
      try {
        logo = { buffer: await getObjectBuffer(logoFile.r2Key), extension };
      } catch {
        logo = null; // e.g. object missing — fall back to no logo
      }
    }
  }
  return {
    accentColor: settings.accentColor,
    colors: settings.invoicePaymentDetails?.colors,
    orgName: settings.orgName,
    preparedByNote: settings.preparedByNote,
    logo,
  };
}

/** Build the branded quotation .xlsx for a project as a Node Buffer. */
export async function buildQuotationBuffer(
  projectId: string,
  projectTitle: string,
  runId?: string,
  projectKind?: string | null
): Promise<Buffer> {
  const { settings, items } = await getBudgetData(projectId, runId);
  const branding = await loadBranding();
  const wb = buildQuotationWorkbook(
    settings,
    items,
    projectTitle,
    branding,
    projectKind
  );
  const written = await wb.xlsx.writeBuffer();
  return Buffer.from(written as ArrayBuffer);
}

/**
 * Build a partner-safe itemized workbook. Only explicitly visible public
 * labels/rates are included; internal labels, notes, spend, and deductions do
 * not cross this boundary.
 */
export async function buildPartnerQuotationBuffer(
  projectId: string,
  projectTitle: string,
  runId?: string,
  projectKind?: string | null
): Promise<Buffer> {
  const { settings, items, presentation } = await getBudgetData(projectId, runId);
  if (!presentation) {
    throw new Error("Set up the partner quote before exporting it.");
  }
  if (presentation.mode !== "itemized") {
    throw new Error("Per-copy partner quotes are exported as PDF.");
  }
  if (presentation.printOptions?.some((option) => option.currency !== settings.currency)) {
    throw new Error("Review the printing options in the current budget currency before exporting.");
  }
  const publicItems = partnerBaseItems(items, presentation.printOptions)
    .filter((item) => item.partnerVisible)
    .map((item) => {
      const unitPrice = item.partnerUnitPrice ?? item.unitPrice;
      return {
        ...item,
        label: item.partnerLabel?.trim() || item.label,
        unitPrice,
        amount: (
          (Number(item.quantity) || 0) * (Number(unitPrice) || 0)
        ).toFixed(2),
        notes: null,
        amountSecured: "0",
        amountSpent: "0",
      };
    });
  const publicSettings = {
    ...settings,
    partnerContact: null,
    workDescription:
      presentation.publicDescription?.trim() ||
      settings.workDescription ||
      projectTitle,
  };
  const branding = await loadBranding();
  const wb = buildQuotationWorkbook(
    publicSettings,
    publicItems,
    projectTitle,
    branding,
    projectKind,
    presentation.printOptions
  );
  const written = await wb.xlsx.writeBuffer();
  return Buffer.from(written as ArrayBuffer);
}

/** Export one partner's share only, using the same saved context as proposal sending. */
export async function buildAllocatedQuotationBuffer(projectId: string, projectTitle: string, quotationId: string, runId?: string, projectKind?: string | null): Promise<Buffer> {
  const { settings, items, printOptions } = await getPartnerQuotationContext(projectId, runId, quotationId);
  const branding = await loadBranding();
  const workbook = buildQuotationWorkbook(settings, items, projectTitle, branding, projectKind, printOptions);
  return Buffer.from(await workbook.xlsx.writeBuffer() as ArrayBuffer);
}
