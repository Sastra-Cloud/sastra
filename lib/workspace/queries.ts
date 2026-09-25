import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  files,
  invoiceSequences,
  partners,
  printContacts,
  rightsHolders,
  user,
  workspaceSettings,
} from "@/lib/db/schema";

export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;

export type WorkspaceAiContext = {
  organization: {
    name: string | null;
    legalName: string | null;
    aliases: string[];
    internalEmailDomains: string[];
    missionContext: string | null;
    sourceLanguage: string | null;
    targetLanguage: string | null;
    defaultTerritory: string | null;
    defaultCurrency: string;
  };
  activeUsers: Array<{ name: string; email: string; role: string }>;
  directories: {
    rightsHolders: string[];
    fundingPartners: string[];
    printers: string[];
  };
};

export type InvoiceIssuerSnapshot = {
  orgName: string | null;
  legalName: string | null;
  logoFileId: string | null;
  accentColor: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string[];
  registrationNumber: string | null;
  taxId: string | null;
  paymentInstructions: string | null;
  invoicePaymentDetails?: { issuerName?: string; logoFileId?: string | null; title: string; fields: Array<{ label: string; value: string }> } | null;
};

/** Read the workspace branding singleton, creating it on first access. */
export async function getWorkspaceSettings(): Promise<WorkspaceSettings> {
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, "workspace"))
    .limit(1);
  if (row) return row;
  await db
    .insert(workspaceSettings)
    .values({ id: "workspace" })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.id, "workspace"))
    .limit(1);
  return created;
}

export async function getInvoiceSequenceSettings() {
  const configuredStart = Number.parseInt(process.env.INVOICE_NUMBER_START ?? "1", 10);
  await db.insert(invoiceSequences).values({
    id: "default",
    nextNumber: Number.isFinite(configuredStart) && configuredStart > 0 ? configuredStart : 1,
  }).onConflictDoNothing();
  const [row] = await db.select().from(invoiceSequences).where(eq(invoiceSequences.id, "default")).limit(1);
  return row;
}

export function workspaceSetupComplete(settings: WorkspaceSettings): boolean {
  return !!(
    settings.setupCompletedAt &&
    settings.orgName?.trim() &&
    settings.sourceLanguage?.trim() &&
    settings.targetLanguage?.trim()
  );
}

export function getInvoiceIssuerSnapshot(
  settings: WorkspaceSettings
): InvoiceIssuerSnapshot {
  return {
    orgName: settings.orgName,
    legalName: settings.invoicePaymentDetails?.issuerName?.trim() || settings.legalName,
    logoFileId: settings.invoicePaymentDetails?.logoFileId ?? settings.logoFileId,
    accentColor: settings.accentColor,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    address: [
      settings.addressLine1,
      settings.addressLine2,
      [settings.addressCity, settings.addressRegion, settings.addressPostalCode]
        .filter(Boolean)
        .join(", "),
      settings.addressCountry,
    ].filter((value): value is string => !!value?.trim()),
    registrationNumber: settings.registrationNumber,
    taxId: settings.taxId,
    paymentInstructions: settings.paymentInstructions,
    invoicePaymentDetails: settings.invoicePaymentDetails,
  };
}

/** Trusted organization context shared by every AI feature. */
export async function getWorkspaceAiContext(): Promise<WorkspaceAiContext> {
  const [settings, activeUsers, holderRows, partnerRows, printerRows] =
    await Promise.all([
      getWorkspaceSettings(),
      db
        .select({ name: user.name, email: user.email, role: user.role })
        .from(user)
        .where(and(eq(user.isActive, true), eq(user.isBot, false)))
        .orderBy(asc(user.name)),
      db.select({ name: rightsHolders.name }).from(rightsHolders),
      db.select({ name: partners.name }).from(partners),
      db
        .select({ name: printContacts.name, company: printContacts.company })
        .from(printContacts),
    ]);
  return {
    organization: {
      name: settings.orgName,
      legalName: settings.legalName,
      aliases: settings.orgAliases,
      internalEmailDomains: settings.internalEmailDomains,
      missionContext: settings.missionContext,
      sourceLanguage: settings.sourceLanguage,
      targetLanguage: settings.targetLanguage,
      defaultTerritory: settings.defaultTerritory,
      defaultCurrency: settings.defaultCurrency,
    },
    activeUsers,
    directories: {
      rightsHolders: holderRows.map((row) => row.name),
      fundingPartners: partnerRows.map((row) => row.name),
      printers: printerRows
        .flatMap((row) => [row.company, row.name])
        .filter((value): value is string => !!value),
    },
  };
}

/** The workspace logo's R2 key + mime, ready to embed — null when unset. */
export async function getWorkspaceLogoFile(): Promise<{
  r2Key: string;
  mimeType: string;
} | null> {
  const settings = await getWorkspaceSettings();
  if (!settings.logoFileId) return null;
  const [file] = await db
    .select({
      r2Key: files.r2Key,
      mimeType: files.mimeType,
      status: files.status,
    })
    .from(files)
    .where(eq(files.id, settings.logoFileId))
    .limit(1);
  if (!file || file.status !== "ready") return null;
  return { r2Key: file.r2Key, mimeType: file.mimeType };
}
