"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { files, invoices, invoiceSequences, workspaceSettings } from "@/lib/db/schema";
import { deleteObject } from "@/lib/r2";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { logActivity } from "@/lib/activity/log";
import { capacityGroupsSchema, normalizeGroups } from "@/lib/planning/groups";

const nullableText = (max: number) =>
  z.string().trim().max(max).optional();

const workspaceSchema = z.object({
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #B65C3A")
    .optional(),
  orgName: z.string().max(200).optional(),
  legalName: nullableText(200),
  orgAliases: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  internalEmailDomains: z
    .array(z.string().trim().min(1).max(200))
    .max(30)
    .optional(),
  preparedByNote: z.string().max(300).optional(),
  timezone: nullableText(100),
  sourceLanguage: nullableText(100),
  targetLanguage: nullableText(100),
  defaultTerritory: nullableText(120),
  defaultCurrency: z.string().trim().min(3).max(8).optional(),
  missionContext: nullableText(2000),
  contactEmail: z.union([z.literal(""), z.string().email()]).optional(),
  contactPhone: nullableText(100),
  addressLine1: nullableText(200),
  addressLine2: nullableText(200),
  addressCity: nullableText(120),
  addressRegion: nullableText(120),
  addressPostalCode: nullableText(40),
  addressCountry: nullableText(120),
  registrationNumber: nullableText(120),
  taxId: nullableText(120),
  paymentInstructions: nullableText(2000),
  invoicePaymentDetails: z.object({
    issuerName: z.string().trim().max(200).optional(),
    logoFileId: z.string().uuid().nullable().optional(),
    title: z.string().trim().max(100),
    fields: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().max(500) })).max(20),
  }).nullable().optional(),
  workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  workHoursStart: z.number().int().min(0).max(1439).optional(),
  workHoursEnd: z.number().int().min(1).max(1440).optional(),
  weeklyDigestDay: z.number().int().min(0).max(6).optional(),
  weeklyDigestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  externalFollowUpBusinessDays: z.number().int().min(1).max(30).optional(),
  wordsPerPage: z.number().int().min(1).max(2000).optional(),
  languageExpansionFactor: z.number().min(0.1).max(10).optional(),
  trimWidthIn: z.number().min(1).max(30).optional(),
  trimHeightIn: z.number().min(1).max(30).optional(),
  defaultDeliveryLocation: nullableText(200),
  financialEmail: z.union([z.literal(""), z.string().email()]).optional(),
  defaultCcEmails: z.array(z.string().email()).max(30).optional(),
  fundingAccountLabel: nullableText(200),
  defaultFundingDeductionPercent: z.number().min(0).max(99.99).optional(),
  rateTranslation: z.number().min(0).max(100000).optional(),
  rateProofreading: z.number().min(0).max(100000).optional(),
  rateEditing: z.number().min(0).max(100000).optional(),
  rateCoverDesign: z.number().min(0).max(100000).optional(),
  rateTypesetting: z.number().min(0).max(100000).optional(),
  rateProjectManagement: z.number().min(0).max(100000).optional(),
  ratePrintShip: z.number().min(0).max(1000000).optional(),
  rateAudiobook: z.number().min(0).max(100000).optional(),
  rateVideoSeries: z.number().min(0).max(100000).optional(),
  projectsConcurrent: z.number().int().min(1).max(50).optional(),
  capacityGroups: capacityGroupsSchema.optional(),
  durationMonthsBook: z.number().int().min(1).max(120).optional(),
  durationMonthsArticle: z.number().int().min(1).max(120).optional(),
  durationMonthsPodcast: z.number().int().min(1).max(120).optional(),
  durationMonthsVideoSeries: z.number().int().min(1).max(120).optional(),
  durationMonthsOther: z.number().int().min(1).max(120).optional(),
});

export type WorkspaceSettingsInput = z.input<typeof workspaceSchema>;

function nullable(value: string | undefined) {
  return value === undefined ? undefined : value.trim() || null;
}

function revalidateWorkspaceSurfaces() {
  for (const path of [
    "/setup",
    "/settings/workspace",
    "/settings/team",
    "/projects/new",
    "/dashboard",
  ]) {
    revalidatePath(path);
  }
}

export async function updateWorkspaceSettings(
  fields: WorkspaceSettingsInput,
  options: { completeSetup?: boolean } = {}
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("admin");
  const parsed = workspaceSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the workspace settings." };
  }
  const f = parsed.data;
  if (f.invoicePaymentDetails?.logoFileId) {
    const [logo] = await db.select({ status: files.status, mimeType: files.mimeType }).from(files).where(eq(files.id, f.invoicePaymentDetails.logoFileId)).limit(1);
    if (!logo || logo.status !== "ready" || !["image/png", "image/jpeg"].includes(logo.mimeType)) return { error: "Choose an uploaded PNG or JPEG invoice logo." };
  }
  if (
    options.completeSetup &&
    (!f.orgName?.trim() || !f.sourceLanguage?.trim() || !f.targetLanguage?.trim())
  ) {
    return { error: "Organization name and source/target languages are required." };
  }
  await getWorkspaceSettings();
  const textFields = [
    "orgName",
    "legalName",
    "preparedByNote",
    "timezone",
    "sourceLanguage",
    "targetLanguage",
    "defaultTerritory",
    "missionContext",
    "contactEmail",
    "contactPhone",
    "addressLine1",
    "addressLine2",
    "addressCity",
    "addressRegion",
    "addressPostalCode",
    "addressCountry",
    "registrationNumber",
    "taxId",
    "paymentInstructions",
    "defaultDeliveryLocation",
    "financialEmail",
    "fundingAccountLabel",
  ] as const;
  const set: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: actor.id,
  };
  for (const key of textFields) {
    if (f[key] !== undefined) set[key] = nullable(f[key]);
  }
  for (const key of [
    "invoicePaymentDetails",
    "accentColor",
    "defaultCurrency",
    "workDays",
    "workHoursStart",
    "workHoursEnd",
    "weeklyDigestDay",
    "weeklyDigestTime",
    "externalFollowUpBusinessDays",
    "wordsPerPage",
    "languageExpansionFactor",
    "trimWidthIn",
    "trimHeightIn",
    "defaultCcEmails",
    "rateTranslation",
    "rateProofreading",
    "rateEditing",
    "rateCoverDesign",
    "rateTypesetting",
    "rateProjectManagement",
    "ratePrintShip",
    "rateAudiobook",
    "rateVideoSeries",
    "projectsConcurrent",
    "durationMonthsBook",
    "durationMonthsArticle",
    "durationMonthsPodcast",
    "durationMonthsVideoSeries",
    "durationMonthsOther",
  ] as const) {
    if (f[key] !== undefined) set[key] = f[key];
  }
  if (f.defaultFundingDeductionPercent !== undefined) {
    set.defaultFundingDeductionBps = Math.round(
      f.defaultFundingDeductionPercent * 100
    );
  }
  if (f.capacityGroups !== undefined) {
    // Normalize so every kind maps to exactly one path and no group is empty.
    set.capacityGroups = normalizeGroups(f.capacityGroups);
  }
  if (f.orgAliases !== undefined) set.orgAliases = f.orgAliases;
  if (f.internalEmailDomains !== undefined) {
    set.internalEmailDomains = f.internalEmailDomains.map((domain) =>
      domain.toLowerCase().replace(/^@/, "")
    );
  }
  if (options.completeSetup) set.setupCompletedAt = new Date();
  await db
    .update(workspaceSettings)
    .set(set)
    .where(eq(workspaceSettings.id, "workspace"));
  await logActivity({
    actorId: actor.id,
    entityType: "workspace_settings",
    entityId: "workspace",
    action: options.completeSetup ? "complete_setup" : "update",
    summary: options.completeSetup
      ? "Completed workspace setup"
      : "Updated workspace settings",
    data: { fields: Object.keys(f) },
  });
  revalidateWorkspaceSurfaces();
  return {};
}

export async function updateWorkspaceBranding(
  fields: WorkspaceSettingsInput
): Promise<{ error?: string }> {
  return updateWorkspaceSettings(fields);
}

export async function completeWorkspaceSetup(
  fields: WorkspaceSettingsInput
): Promise<{ error?: string }> {
  return updateWorkspaceSettings(fields, { completeSetup: true });
}

export async function updateInvoiceSequence(input: {
  prefix: string;
  nextNumber: number;
  padding: number;
}): Promise<{ error?: string }> {
  const { user } = await requireRole("admin");
  const parsed = z.object({
    prefix: z.string().max(30),
    nextNumber: z.number().int().min(1),
    padding: z.number().int().min(1).max(20),
  }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check invoice numbering." };
  const existing = await db.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices);
  const escapedPrefix = parsed.data.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);
  let highest = 0;
  for (const row of existing) {
    const match = pattern.exec(row.invoiceNumber);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  if (parsed.data.nextNumber <= highest) {
    return { error: `Next number must be at least ${highest + 1} for this prefix.` };
  }
  await db.insert(invoiceSequences).values({ id: "default", ...parsed.data }).onConflictDoUpdate({
    target: invoiceSequences.id,
    set: { ...parsed.data, updatedAt: new Date() },
  });
  await logActivity({
    actorId: user.id,
    entityType: "invoice_sequence",
    entityId: "default",
    action: "update",
    summary: "Updated invoice numbering",
    data: { prefix: parsed.data.prefix, nextNumber: parsed.data.nextNumber, padding: parsed.data.padding },
  });
  revalidatePath("/settings/workspace");
  return {};
}

/** Best-effort removal of a prior logo's file row + R2 object. */
async function cleanupLogoFile(fileId: string) {
  try {
    const [old] = await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1);
    if (old) {
      await deleteObject(old.r2Key);
      await db.delete(files).where(eq(files.id, old.id));
    }
  } catch {
    // ignore — an orphaned object can be swept later
  }
}

export async function setWorkspaceLogo(
  fileId: string
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("admin");
  const [file] = await db
    .select()
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  if (!file || file.status !== "ready" || !file.mimeType.startsWith("image/")) {
    return { error: "That image isn't available." };
  }
  const settings = await getWorkspaceSettings();
  const previous = settings.logoFileId;
  await db
    .update(workspaceSettings)
    .set({ logoFileId: fileId, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(workspaceSettings.id, "workspace"));
  if (previous && previous !== fileId) await cleanupLogoFile(previous);
  revalidateWorkspaceSurfaces();
  return {};
}

export async function removeWorkspaceLogo(): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("admin");
  const settings = await getWorkspaceSettings();
  const previous = settings.logoFileId;
  if (!previous) return {};
  await db
    .update(workspaceSettings)
    .set({ logoFileId: null, updatedBy: actor.id, updatedAt: new Date() })
    .where(eq(workspaceSettings.id, "workspace"));
  await cleanupLogoFile(previous);
  revalidateWorkspaceSurfaces();
  return {};
}
