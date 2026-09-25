"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { db } from "@/lib/db";
import {
  activityLog,
  budgetItems,
  budgetApprovalRequests,
  budgetScopePresentations,
  donationAllocations,
  fundingReceipts,
  files,
  emailThreads,
  emailThreadProjects,
  invoiceDeliveries,
  invoices,
  invoiceSequences,
  mouPaymentProjects,
  mouPayments,
  printQuotes,
  projectBudgetSettings,
  projectPrintSettings,
  projects,
  royaltyPayments,
  sharedMouGroups,
  sharedMouMemberships,
  sharedMouReceiptAllocations,
  sharedMouReceipts,
  tasks,
} from "@/lib/db/schema";
import { ensureRoyaltyPaymentForProject } from "@/lib/budget/royalty-recurring";
import {
  STANDARD_LINES,
  DEFAULT_LANGUAGE_EXPANSION_FACTOR,
  deductionPercentToBps,
  grossTargetCents,
  lineAmount,
  lineQuantity,
  expectedNetCents,
  partnerQuoteTotalCents,
  rateForCategory,
  suggestedPerCopyPriceCents,
  suggestPartnerRates,
  sumAmountCents,
  type BudgetGroup,
  type QuantityBasis,
  type BudgetUnit,
} from "@/lib/budget/compute";
import {
  getBudgetPresentation,
  getOrCreateBudgetSettings,
  getProjectBudget,
} from "@/lib/budget/queries";
import {
  PAYMENT_EPISODE_MILESTONE,
  publishedEpisodeCount,
} from "@/lib/episodes/queries";
import { logActivity } from "@/lib/activity/log";
import { notify } from "@/lib/notifications";
import { formatDate } from "@/lib/format";
import { allCoveredProjectsComplete } from "@/lib/budget/mou-payments";
import { allocateSharedReceipt } from "@/lib/agreements/readiness";
import { syncBudgetApprovalState } from "@/lib/budget/approval-service";
import {
  getSharedPaymentReadiness,
  reevaluateSharedMouPayments,
} from "@/lib/agreements/readiness-engine";
import {
  getInvoiceIssuerSnapshot,
  getWorkspaceSettings,
} from "@/lib/workspace/queries";
import { syncAcceptedQuoteToRunBudget } from "@/lib/print/budget-sync";
import { getMouInvoiceDetails } from "@/lib/budget/invoice-details";
import { buildInvoicePdf } from "@/lib/budget/pdf";
import { buildKey, putObject } from "@/lib/r2";
import { getObjectBuffer } from "@/lib/r2";
import { sendEmail } from "@/lib/gmail";
import { removeEmailDraftForUser } from "@/lib/email/draft-store";

async function revalidate(projectId: string) {
  const activeApprovalScopes = await db
    .selectDistinct({ printRunId: budgetApprovalRequests.printRunId })
    .from(budgetApprovalRequests)
    .where(
      and(
        eq(budgetApprovalRequests.projectId, projectId),
        ne(budgetApprovalRequests.status, "superseded")
      )
    );
  const scopes = new Set<string | null>([
    null,
    ...activeApprovalScopes.map((row) => row.printRunId),
  ]);
  await Promise.all(
    [...scopes].map((printRunId) =>
      syncBudgetApprovalState(projectId, printRunId)
    )
  );
  await recomputeProjectBlockers(projectId);
  const [p] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (p) {
    revalidatePath(`/projects/${p.slug}/budget`);
    revalidatePath(`/projects/${p.slug}/print`);
    revalidatePath(`/projects/${p.slug}/tasks`);
    revalidatePath(`/projects/${p.slug}`);
    revalidatePath("/projects");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function nextAnnualDueDate(month: number, day: number, from = new Date()): string {
  const today = todayIso();
  const clampedForYear = (year: number) => {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const safeDay = Math.min(day, lastDay);
    return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(
      2,
      "0"
    )}`;
  };
  const candidate = clampedForYear(from.getFullYear());
  return candidate >= today ? candidate : clampedForYear(from.getFullYear() + 1);
}

function moneyLabel(value: string | number, currency: string) {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const MOU_TRIGGER_LABELS: Record<string, string> = {
  on_signing: "on MoU signing",
  on_completion: "on project completion",
  on_52_episodes: `after ${PAYMENT_EPISODE_MILESTONE} episodes published`,
  custom: "on scheduled date",
};

type MouInvoiceTaskSource = {
  amount: string;
  currency: string;
  trigger: string;
  dueDate: string | null;
  notes: string | null;
  projectTitle: string;
};

function mouInvoiceTaskCopy(
  pay: MouInvoiceTaskSource,
  settings: { partnerName: string | null; partnerContact: string | null }
) {
  const triggerLabel = MOU_TRIGGER_LABELS[pay.trigger] ?? MOU_TRIGGER_LABELS.custom;
  const title =
    pay.trigger === "on_completion"
      ? `Submit final MoU invoice for ${pay.projectTitle}`
      : `Submit MoU invoice for ${pay.projectTitle}`;
  const description = [
    `${moneyLabel(pay.amount, pay.currency)} ${triggerLabel}.`,
    settings.partnerName ? `Partner: ${settings.partnerName}.` : null,
    settings.partnerContact ? `Send invoice to: ${settings.partnerContact}.` : null,
    pay.dueDate ? `Scheduled date: ${pay.dueDate}.` : null,
    pay.notes ? `Notes: ${pay.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { title, description, triggerLabel };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function nextInvoiceNumber(tx: Tx): Promise<string> {
  const configuredStart = Number.parseInt(
    process.env.INVOICE_NUMBER_START ?? "344",
    10
  );
  const start = Number.isFinite(configuredStart) && configuredStart > 0 ? configuredStart : 1;

  await tx
    .insert(invoiceSequences)
    .values({ id: "default", nextNumber: start, padding: 5, prefix: "" })
    .onConflictDoNothing();

  const [row] = await tx
    .update(invoiceSequences)
    .set({
      nextNumber: sql`${invoiceSequences.nextNumber} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(invoiceSequences.id, "default"))
    .returning({
      issuedNumber: sql<number>`${invoiceSequences.nextNumber} - 1`,
      padding: invoiceSequences.padding,
      prefix: invoiceSequences.prefix,
    });

  const issued = Number(row?.issuedNumber ?? start);
  const padding = Math.max(1, Number(row?.padding ?? 5));
  return `${row?.prefix ?? ""}${String(issued).padStart(padding, "0")}`;
}

const money = z.coerce.number().min(0).finite();
const rate = z.coerce.number().min(0).finite();

async function getQuantityBasis(
  projectId: string,
  settings?: Awaited<ReturnType<typeof getOrCreateBudgetSettings>>
): Promise<QuantityBasis> {
  const budgetSettings = settings ?? (await getOrCreateBudgetSettings(projectId));
  const [printSettings] = await db
    .select({
      languageExpansionFactor: projectPrintSettings.languageExpansionFactor,
    })
    .from(projectPrintSettings)
    .where(eq(projectPrintSettings.projectId, projectId))
    .limit(1);

  return {
    wordCount: budgetSettings.wordCount,
    sourcePageCount: budgetSettings.sourcePageCount,
    wordsPerPage: budgetSettings.wordsPerPage,
    languageExpansionFactor:
      printSettings?.languageExpansionFactor ?? DEFAULT_LANGUAGE_EXPANSION_FACTOR,
  };
}

/** Recompute every line's quantity (auto only) + amount from current settings. */
async function recomputeProjectLines(projectId: string) {
  const settings = await getOrCreateBudgetSettings(projectId);
  const basis = await getQuantityBasis(projectId, settings);
  const items = await db
    .select()
    .from(budgetItems)
    .where(eq(budgetItems.projectId, projectId));

  await db.transaction(async (tx) => {
    for (const it of items) {
      const quantity = it.isAutoQuantity
        ? String(lineQuantity(it.unit as BudgetUnit, basis))
        : it.quantity;
      const amount = lineAmount(quantity, it.unitPrice);
      if (quantity !== it.quantity || amount !== it.amount) {
        await tx
          .update(budgetItems)
          .set({ quantity, amount, currency: settings.currency, updatedAt: new Date() })
          .where(eq(budgetItems.id, it.id));
      }
    }
  });
}

/** On first visit with no lines, seed the 9 standard quotation lines. */
export async function seedDefaultBudget(projectId: string) {
  await requireRole("manager");
  const settings = await getOrCreateBudgetSettings(projectId);
  const existing = await db
    .select({ id: budgetItems.id })
    .from(budgetItems)
    .where(and(eq(budgetItems.projectId, projectId), isNull(budgetItems.printRunId)))
    .limit(1);
  if (existing.length > 0) return; // idempotent — never duplicate

  const basis = await getQuantityBasis(projectId, settings);
  const rows = STANDARD_LINES.map((line, i) => {
    const quantity = String(lineQuantity(line.unit, basis));
    const unitPrice = rateForCategory(line.category, settings);
    return {
      projectId,
      group: line.group,
      category: line.category,
      label: line.label,
      sortOrder: i,
      unit: line.unit,
      quantity,
      unitPrice,
      amount: lineAmount(quantity, unitPrice),
      isAutoQuantity: true,
      currency: settings.currency,
    };
  });
  await db.insert(budgetItems).values(rows);
  await revalidate(projectId);
}

const settingsSchema = z.object({
  wordCount: z.coerce.number().int().min(0).optional(),
  sourcePageCount: z.coerce.number().int().min(0).optional(),
  wordsPerPage: z.coerce.number().int().min(1).optional(),
  currency: z.string().min(1).max(8).optional(),
  rateTranslation: rate.optional(),
  rateProofreading: rate.optional(),
  rateEditing: rate.optional(),
  rateCoverDesign: rate.optional(),
  rateTypesetting: rate.optional(),
  rateProjectManagement: rate.optional(),
  ratePrintShip: rate.optional(),
  rateAudiobook: rate.optional(),
  rateVideoSeries: rate.optional(),
  partnerName: z.string().max(200).optional(),
  partnerContactFirstName: z.string().max(120).optional(),
  partnerContactLastName: z.string().max(120).optional(),
  partnerContactEmail: z.string().max(320).optional(),
  partnerContact: z.string().max(200).optional(),
  partnerId: z.string().max(64).nullable().optional(),
  partnerContactId: z.string().max(64).nullable().optional(),
  workDescription: z.string().max(2000).optional(),
  royaltyRecipientEmail: z.string().max(320).nullable().optional(),
  royaltyDueMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  royaltyDueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  royaltyTaskAssigneeId: z.string().nullable().optional(),
});

const RATE_KEYS = [
  "rateTranslation",
  "rateProofreading",
  "rateEditing",
  "rateCoverDesign",
  "rateTypesetting",
  "rateProjectManagement",
  "ratePrintShip",
  "rateAudiobook",
  "rateVideoSeries",
] as const;

export async function updateBudgetSettings(
  projectId: string,
  fields: z.input<typeof settingsSchema>
) {
  const { user } = await requireRole("manager");
  const f = settingsSchema.parse(fields);
  await getOrCreateBudgetSettings(projectId);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (f.wordCount !== undefined) set.wordCount = f.wordCount;
  if (f.sourcePageCount !== undefined) set.sourcePageCount = f.sourcePageCount;
  if (f.wordsPerPage !== undefined) set.wordsPerPage = f.wordsPerPage;
  if (f.currency !== undefined) set.currency = f.currency;
  for (const k of RATE_KEYS) {
    if (f[k] !== undefined) set[k] = String(f[k]);
  }
  if (f.partnerName !== undefined) set.partnerName = f.partnerName || null;
  if (f.partnerContactFirstName !== undefined)
    set.partnerContactFirstName = f.partnerContactFirstName.trim() || null;
  if (f.partnerContactLastName !== undefined)
    set.partnerContactLastName = f.partnerContactLastName.trim() || null;
  if (f.partnerContactEmail !== undefined)
    set.partnerContactEmail = f.partnerContactEmail.trim() || null;
  if (f.partnerContact !== undefined) set.partnerContact = f.partnerContact || null;
  if (f.partnerId !== undefined) set.partnerId = f.partnerId || null;
  if (f.partnerContactId !== undefined)
    set.partnerContactId = f.partnerContactId || null;
  if (f.workDescription !== undefined) set.workDescription = f.workDescription || null;
  if (f.royaltyRecipientEmail !== undefined)
    set.royaltyRecipientEmail = f.royaltyRecipientEmail?.trim() || null;
  if (f.royaltyDueMonth !== undefined) set.royaltyDueMonth = f.royaltyDueMonth;
  if (f.royaltyDueDay !== undefined) set.royaltyDueDay = f.royaltyDueDay;
  if (f.royaltyTaskAssigneeId !== undefined)
    set.royaltyTaskAssigneeId = f.royaltyTaskAssigneeId || null;

  await db
    .update(projectBudgetSettings)
    .set(set)
    .where(eq(projectBudgetSettings.projectId, projectId));

  await recomputeProjectLines(projectId);
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "budget",
    action: "settings",
    summary: "Updated budget settings",
  });
  await revalidate(projectId);
}

const lineSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  unit: z.enum(["words", "pages", "cover", "project", "flat"]).optional(),
  unitPrice: money.optional(),
  quantity: money.optional(),
  amountSecured: money.optional(),
  amountSpent: money.optional(),
  notes: z.string().max(1000).optional(),
  partnerLabel: z.string().max(200).nullable().optional(),
  partnerUnitPrice: z.coerce.number().min(0).finite().nullable().optional(),
  partnerVisible: z.boolean().optional(),
});

function budgetLineResult(item: typeof budgetItems.$inferSelect) {
  return {
    id: item.id,
    group: item.group,
    category: item.category,
    label: item.label,
    partnerLabel: item.partnerLabel,
    partnerUnitPrice: item.partnerUnitPrice,
    partnerVisible: item.partnerVisible,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
    amountSecured: item.amountSecured,
    amountSpent: item.amountSpent,
    isAutoQuantity: item.isAutoQuantity,
  };
}

export async function updateBudgetLine(
  id: string,
  fields: z.input<typeof lineSchema>
) {
  const { user } = await requireRole("manager");
  const f = lineSchema.parse(fields);
  const [item] = await db
    .select()
    .from(budgetItems)
    .where(eq(budgetItems.id, id))
    .limit(1);
  if (!item) return;

  const quantity =
    f.quantity !== undefined && !item.isAutoQuantity
      ? String(f.quantity)
      : item.quantity;
  const unitPrice = f.unitPrice !== undefined ? String(f.unitPrice) : item.unitPrice;
  const unit =
    f.unit !== undefined && item.category === "custom" ? f.unit : item.unit;

  const [updated] = await db
    .update(budgetItems)
    .set({
      ...(f.label !== undefined ? { label: f.label } : {}),
      unit,
      ...(f.amountSecured !== undefined
        ? { amountSecured: String(f.amountSecured) }
        : {}),
      ...(f.amountSpent !== undefined
        ? { amountSpent: String(f.amountSpent) }
        : {}),
      ...(f.notes !== undefined ? { notes: f.notes || null } : {}),
      ...(f.partnerLabel !== undefined
        ? { partnerLabel: f.partnerLabel?.trim() || null }
        : {}),
      ...(f.partnerUnitPrice !== undefined
        ? {
            partnerUnitPrice:
              f.partnerUnitPrice == null ? null : String(f.partnerUnitPrice),
          }
        : {}),
      ...(f.partnerVisible !== undefined
        ? { partnerVisible: f.partnerVisible }
        : {}),
      quantity,
      unitPrice,
      amount: lineAmount(quantity, unitPrice),
      updatedAt: new Date(),
    })
    .where(eq(budgetItems.id, id))
    .returning();
  await logActivity({
    actorId: user.id,
    projectId: item.projectId,
    entityType: "budget",
    entityId: id,
    action: "line",
    summary: `Updated budget line "${item.label}"`,
  });
  await revalidate(item.projectId);
  return updated ? budgetLineResult(updated) : undefined;
}

const presentationSchema = z.object({
  printRunId: z.string().uuid().nullable().optional(),
  mode: z.enum(["itemized", "per_copy"]),
  deductionPercent: z.coerce.number().min(0).max(99.99),
  publicDescription: z.string().max(1000).nullable().optional(),
  perCopyQuantity: z.coerce.number().int().min(1).nullable().optional(),
  perCopyUnitPrice: z.coerce.number().min(0).finite().nullable().optional(),
});

/**
 * Opt a legacy scope into deduction-aware partner quoting, or update an
 * existing presentation. Creating the row snapshots the workspace default.
 */
export async function saveBudgetPresentation(
  projectId: string,
  input: z.input<typeof presentationSchema>
) {
  const { user } = await requireRole("manager");
  const parsed = presentationSchema.parse(input);
  const printRunId = parsed.printRunId || null;
  const existing = await getBudgetPresentation(projectId, printRunId ?? undefined);
  const workspace = existing ? null : await getWorkspaceSettings();
  const deductionBps = deductionPercentToBps(
    parsed.deductionPercent ??
      Number(workspace?.defaultFundingDeductionBps ?? 0) / 100
  );
  const values = {
    projectId,
    printRunId,
    mode: parsed.mode,
    deductionBps,
    publicDescription: parsed.publicDescription?.trim() || null,
    perCopyQuantity: parsed.perCopyQuantity ?? null,
    perCopyUnitPrice:
      parsed.perCopyUnitPrice == null ? null : parsed.perCopyUnitPrice.toFixed(2),
    updatedBy: user.id,
    updatedAt: new Date(),
  } as const;

  if (existing) {
    await db
      .update(budgetScopePresentations)
      .set(values)
      .where(eq(budgetScopePresentations.id, existing.id));
  } else {
    await db.insert(budgetScopePresentations).values({
      ...values,
      createdBy: user.id,
    });
  }
  await revalidate(projectId);
  return { ok: true };
}

/** Start a legacy scope using the workspace's current default deduction. */
export async function enableBudgetPresentation(
  projectId: string,
  printRunId?: string | null
) {
  const workspace = await getWorkspaceSettings();
  return saveBudgetPresentation(projectId, {
    printRunId: printRunId ?? null,
    mode: "itemized",
    deductionPercent: Number(workspace.defaultFundingDeductionBps) / 100,
  });
}

/** Suggest public rates on selected lines, preserving internal costs. */
export async function applySuggestedPartnerRates(
  projectId: string,
  printRunId: string | null,
  selectedIds: string[]
) {
  await requireRole("manager");
  const [presentation, items] = await Promise.all([
    getBudgetPresentation(projectId, printRunId ?? undefined),
    getProjectBudget(projectId, printRunId ?? undefined),
  ]);
  if (!presentation) return { error: "Set up the partner quote first." };
  try {
    const selected = new Set(selectedIds);
    const rates = suggestPartnerRates(items, selected, presentation.deductionBps);
    const targetCents = grossTargetCents(
      sumAmountCents(items),
      presentation.deductionBps
    );
    const proposedTotalCents = partnerQuoteTotalCents(
      items.map((item) =>
        rates[item.id]
          ? { ...item, partnerUnitPrice: rates[item.id] }
          : item
      )
    );
    if (proposedTotalCents < targetCents) {
      throw new Error(
        "The suggested rates did not fully cover the funding target. No rates were changed."
      );
    }
    await db.transaction(async (tx) => {
      for (const [id, partnerUnitPrice] of Object.entries(rates)) {
        await tx
          .update(budgetItems)
          .set({ partnerUnitPrice, updatedAt: new Date() })
          .where(and(eq(budgetItems.id, id), eq(budgetItems.projectId, projectId)));
      }
    });
    await revalidate(projectId);
    return { rates };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not suggest rates.",
    };
  }
}

/** Use the exact upward-rounded per-copy price needed to cover current costs. */
export async function applySuggestedPerCopyPrice(
  projectId: string,
  printRunId: string | null,
  quantity: number
) {
  await requireRole("manager");
  const [presentation, items] = await Promise.all([
    getBudgetPresentation(projectId, printRunId ?? undefined),
    getProjectBudget(projectId, printRunId ?? undefined),
  ]);
  if (!presentation) return { error: "Set up the partner quote first." };
  const costs = items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  const cents = suggestedPerCopyPriceCents(costs, presentation.deductionBps, quantity);
  await db
    .update(budgetScopePresentations)
    .set({
      mode: "per_copy",
      perCopyQuantity: quantity,
      perCopyUnitPrice: (cents / 100).toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(budgetScopePresentations.id, presentation.id));
  await revalidate(projectId);
  return { unitPrice: (cents / 100).toFixed(2) };
}

/** Reset a standard line's unit price back to the project's default rate. */
export async function resetBudgetLineRate(id: string) {
  await requireRole("manager");
  const [item] = await db
    .select()
    .from(budgetItems)
    .where(eq(budgetItems.id, id))
    .limit(1);
  if (!item || item.category === "custom") return;
  const settings = await getOrCreateBudgetSettings(item.projectId);
  const unitPrice = rateForCategory(
    item.category as Exclude<typeof item.category, "custom">,
    settings
  );
  await db
    .update(budgetItems)
    .set({
      unitPrice,
      amount: lineAmount(item.quantity, unitPrice),
      updatedAt: new Date(),
    })
    .where(eq(budgetItems.id, id));
  await revalidate(item.projectId);
}

const customSchema = z.object({
  group: z.enum(["book_publishing", "additional_media"]),
  printRunId: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(200),
  unit: z.enum(["words", "pages", "cover", "project", "flat"]),
  quantity: money,
  unitPrice: money,
});

export async function addCustomLine(
  projectId: string,
  fields: z.input<typeof customSchema>
) {
  const { user } = await requireRole("manager");
  const f = customSchema.parse(fields);
  const settings = await getOrCreateBudgetSettings(projectId);
  const [{ maxSort } = { maxSort: 0 }] = await db
    .select({ maxSort: budgetItems.sortOrder })
    .from(budgetItems)
    .where(
      f.printRunId
        ? and(eq(budgetItems.projectId, projectId), eq(budgetItems.printRunId, f.printRunId))
        : eq(budgetItems.projectId, projectId)
    )
    .orderBy(desc(budgetItems.sortOrder))
    .limit(1);
  const quantity = String(f.quantity);
  const unitPrice = String(f.unitPrice);
  const [created] = await db
    .insert(budgetItems)
    .values({
      projectId,
      printRunId: f.printRunId || null,
      group: f.group as BudgetGroup,
      category: "custom",
      label: f.label,
      sortOrder: (maxSort ?? 0) + 100,
      unit: f.unit as BudgetUnit,
      quantity,
      unitPrice,
      amount: lineAmount(quantity, unitPrice),
      isAutoQuantity: false,
      currency: settings.currency,
    })
    .returning();
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "budget",
    action: "line",
    summary: `Added budget line "${f.label}"`,
  });
  await revalidate(projectId);
  return created ? budgetLineResult(created) : undefined;
}

/** Backfill an accepted reprint quote into its run-scoped budget. */
export async function addAcceptedPrintQuoteBudgetLine(quoteId: string) {
  const { user } = await requireRole("manager");
  const [quote] = await db
    .select()
    .from(printQuotes)
    .where(eq(printQuotes.id, quoteId))
    .limit(1);
  if (!quote) return { error: "Print quote not found." };
  if (quote.reviewStatus !== "accepted") {
    return { error: "Accept this printer quote before adding it to the budget." };
  }

  const item = await syncAcceptedQuoteToRunBudget(quote);
  if (!item) {
    return {
      error: "This accepted quote does not have a usable reprint total.",
    };
  }
  await logActivity({
    actorId: user.id,
    projectId: quote.projectId,
    entityType: "budget",
    entityId: item.id,
    action: "line",
    summary: `Added accepted print quote to budget as "${item.label}"`,
  });
  await revalidate(quote.projectId);
  return { item: budgetLineResult(item) };
}

export async function deleteBudgetLine(id: string) {
  const { user } = await requireRole("manager");
  const [row] = await db
    .delete(budgetItems)
    .where(eq(budgetItems.id, id))
    .returning({ projectId: budgetItems.projectId, label: budgetItems.label });
  if (row) {
    await logActivity({
      actorId: user.id,
      projectId: row.projectId,
      entityType: "budget",
      action: "line",
      summary: `Removed budget line "${row.label}"`,
    });
    await revalidate(row.projectId);
  }
}

// ── Funding received (money-in ledger) ───────────────────────────────────────

const receiptSchema = z.object({
  printRunId: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().min(0.01).finite(),
  currency: z.string().min(1).max(8).default("USD"),
  receivedDate: z.string().optional(),
  source: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  actualNetAmount: z.coerce.number().min(0).finite().nullable().optional(),
});

async function receiptNetValues(
  projectId: string,
  printRunId: string | null,
  grossAmount: number,
  actualNetAmount?: number | null
) {
  const presentation = await getBudgetPresentation(
    projectId,
    printRunId ?? undefined
  );
  const deductionBps = presentation?.deductionBps ?? 0;
  const expected = expectedNetCents(
    Math.round(grossAmount * 100),
    deductionBps
  );
  return {
    deductionBps,
    expectedNetAmount: (expected / 100).toFixed(2),
    actualNetAmount:
      actualNetAmount == null
        ? (expected / 100).toFixed(2)
        : actualNetAmount.toFixed(2),
  };
}

/** Record a payment received for a project. */
export async function addReceipt(
  projectId: string,
  input: z.input<typeof receiptSchema>
): Promise<{ error?: string; id?: string }> {
  const { user } = await requireRole("manager");
  const d = receiptSchema.parse(input);
  const net = await receiptNetValues(
    projectId,
    d.printRunId || null,
    d.amount,
    d.actualNetAmount
  );
  const [created] = await db
    .insert(fundingReceipts)
    .values({
      projectId,
      printRunId: d.printRunId || null,
      amount: d.amount.toFixed(2),
      ...net,
      currency: d.currency,
      receivedDate: d.receivedDate || null,
      source: d.source?.trim() || null,
      note: d.note?.trim() || null,
      recordedBy: user.id,
    })
    .returning({ id: fundingReceipts.id });
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "budget",
    action: "receipt",
    summary: `Recorded ${d.currency} ${d.amount.toFixed(2)} received${
      d.source ? ` from ${d.source.trim()}` : ""
    }`,
  });
  await revalidate(projectId);
  return { id: created.id };
}

async function receiptIsLinkedToMouPayment(id: string): Promise<boolean> {
  const [linked] = await db
    .select({ id: mouPayments.id })
    .from(mouPayments)
    .where(eq(mouPayments.receiptId, id))
    .limit(1);
  return !!linked;
}

async function receiptIsLinkedToImportedDonation(id: string): Promise<boolean> {
  const [linked] = await db
    .select({ id: donationAllocations.id })
    .from(donationAllocations)
    .where(eq(donationAllocations.fundingReceiptId, id))
    .limit(1);
  return !!linked;
}

export async function updateReceipt(
  id: string,
  input: z.input<typeof receiptSchema>
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  if (await receiptIsLinkedToMouPayment(id)) {
    return {
      error:
        "This receipt came from a scheduled MoU payment. Edit the scheduled payment instead.",
    };
  }
  if (await receiptIsLinkedToImportedDonation(id)) {
    return {
      error:
        "This receipt came from an imported donation. Correct it from Donations.",
    };
  }
  const d = receiptSchema.parse(input);
  const [existing] = await db
    .select({
      projectId: fundingReceipts.projectId,
      printRunId: fundingReceipts.printRunId,
    })
    .from(fundingReceipts)
    .where(eq(fundingReceipts.id, id))
    .limit(1);
  if (!existing) return { error: "Receipt not found." };
  const nextPrintRunId =
    d.printRunId !== undefined ? d.printRunId || null : existing.printRunId;
  const net = await receiptNetValues(
    existing.projectId,
    nextPrintRunId,
    d.amount,
    d.actualNetAmount
  );
  const patch: Partial<typeof fundingReceipts.$inferInsert> = {
    amount: d.amount.toFixed(2),
    ...net,
    currency: d.currency,
    receivedDate: d.receivedDate || null,
    source: d.source?.trim() || null,
    note: d.note?.trim() || null,
    updatedAt: new Date(),
  };
  if (d.printRunId !== undefined) patch.printRunId = d.printRunId || null;
  const [row] = await db
    .update(fundingReceipts)
    .set(patch)
    .where(eq(fundingReceipts.id, id))
    .returning({ projectId: fundingReceipts.projectId });
  if (!row) return { error: "Receipt not found." };

  await logActivity({
    actorId: user.id,
    projectId: row.projectId,
    entityType: "budget",
    entityId: id,
    action: "receipt",
    summary: `Updated ${d.currency} ${d.amount.toFixed(2)} received${
      d.source ? ` from ${d.source.trim()}` : ""
    }`,
  });
  await revalidate(row.projectId);
  return {};
}

export async function deleteReceipt(id: string): Promise<{ error?: string }> {
  await requireRole("manager");
  if (await receiptIsLinkedToMouPayment(id)) {
    return {
      error:
        "This receipt came from a scheduled MoU payment. Mark that payment unpaid instead.",
    };
  }
  if (await receiptIsLinkedToImportedDonation(id)) {
    return {
      error:
        "This receipt came from an imported donation. Correct it from Donations.",
    };
  }
  const [row] = await db
    .delete(fundingReceipts)
    .where(eq(fundingReceipts.id, id))
    .returning({ projectId: fundingReceipts.projectId });
  if (row) await revalidate(row.projectId);
  return {};
}

// ── Royalties ────────────────────────────────────────────────────────────────

const royaltiesSchema = z.object({
  requiresRoyalties: z.boolean(),
  royaltyPercentage: z.coerce.number().min(0).max(100).nullable().optional(),
  royaltyRecipientEmail: z.string().max(320).nullable().optional(),
  royaltyDueMonth: z.coerce.number().int().min(1).max(12).nullable().optional(),
  royaltyDueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  royaltyTaskAssigneeId: z.string().nullable().optional(),
  royaltyFrequency: z
    .enum(["annual", "quarterly", "monthly"])
    .optional()
    .default("annual"),
  royaltyAmount: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(),
  royaltyCurrency: z.string().max(8).nullable().optional(),
});

export async function updateProjectRoyalties(
  projectId: string,
  input: z.input<typeof royaltiesSchema>
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const inputData = royaltiesSchema.parse(input);
  const pct =
    inputData.royaltyPercentage == null ||
    !Number.isFinite(inputData.royaltyPercentage)
      ? null
      : Math.max(0, Math.min(100, inputData.royaltyPercentage));
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        requiresRoyalties: inputData.requiresRoyalties,
        royaltyPercentage:
          inputData.requiresRoyalties && pct != null ? pct.toFixed(2) : null,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    await tx
      .insert(projectBudgetSettings)
      .values({ projectId })
      .onConflictDoNothing({ target: projectBudgetSettings.projectId });

    await tx
      .update(projectBudgetSettings)
      .set({
        royaltyRecipientEmail:
          inputData.royaltyRecipientEmail?.trim() || null,
        royaltyDueMonth: inputData.royaltyDueMonth ?? null,
        royaltyDueDay: inputData.royaltyDueDay ?? null,
        royaltyTaskAssigneeId: inputData.royaltyTaskAssigneeId || null,
        royaltyFrequency: inputData.royaltyFrequency,
        royaltyAmount:
          inputData.royaltyAmount != null && inputData.royaltyAmount > 0
            ? inputData.royaltyAmount.toFixed(2)
            : null,
        royaltyCurrency: inputData.royaltyCurrency?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(projectBudgetSettings.projectId, projectId));
  });
  // With an amount, schedule the recurring payment + task; otherwise fall back
  // to the lightweight annual reminder (no amount).
  await ensureRoyaltyPaymentForProject(projectId, user.id);
  await ensureRoyaltyReminderTask(projectId, user.id);
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "budget",
    action: "royalties",
    summary: inputData.requiresRoyalties
      ? "Updated royalty reminder settings"
      : "Disabled royalties",
  });
  await revalidate(projectId);
  return {};
}

async function ensureRoyaltyReminderTask(
  projectId: string,
  actorId?: string | null
): Promise<boolean> {
  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      slug: projects.slug,
      requiresRoyalties: projects.requiresRoyalties,
      royaltyPercentage: projects.royaltyPercentage,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.requiresRoyalties) return false;

  const settings = await getOrCreateBudgetSettings(projectId);
  // When an amount is set, the recurring-payment path owns generation instead.
  if (settings.royaltyAmount != null && Number(settings.royaltyAmount) > 0) {
    return false;
  }
  if (
    !settings.royaltyDueMonth ||
    !settings.royaltyDueDay ||
    !settings.royaltyTaskAssigneeId
  ) {
    return false;
  }

  const dueDate = nextAnnualDueDate(
    settings.royaltyDueMonth,
    settings.royaltyDueDay
  );
  const title = `Send annual royalty information for ${project.title}`;
  const [existing] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.title, title),
        eq(tasks.dueDate, dueDate),
        ne(tasks.status, "done")
      )
    )
    .limit(1);
  if (existing) return false;

  const description = [
    `Send annual royalty information for ${project.title}.`,
    settings.royaltyRecipientEmail
      ? `Recipient: ${settings.royaltyRecipientEmail}.`
      : null,
    project.royaltyPercentage ? `Royalty rate: ${project.royaltyPercentage}%.` : null,
    `Annual due date: ${String(settings.royaltyDueMonth).padStart(2, "0")}-${String(
      settings.royaltyDueDay
    ).padStart(2, "0")}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const [task] = await db
    .insert(tasks)
    .values({
      projectId,
      title,
      description,
      status: "todo",
      priority: "medium",
      assignedTo: settings.royaltyTaskAssigneeId,
      createdBy: actorId ?? null,
      dueDate,
      isMilestone: true,
    })
    .returning({ id: tasks.id });

  if (settings.royaltyTaskAssigneeId !== actorId) {
    await notify({
      userId: settings.royaltyTaskAssigneeId,
      type: "task_assigned",
      title: `Task assigned to you: ${title}`,
      body: `Due ${formatDate(dueDate)}`,
      project: project.title,
      link: `/projects/${project.slug}/tasks`,
      data: { taskId: task.id, projectId },
    });
  }
  return true;
}

export async function ensureRoyaltyReminderTasksForAllProjects(): Promise<number> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.requiresRoyalties, true));

  let created = 0;
  for (const row of rows) {
    if (await ensureRoyaltyReminderTask(row.id, null)) created += 1;
  }
  return created;
}

export async function markRoyaltyPaid(id: string): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [row] = await db
    .update(royaltyPayments)
    .set({ paidAt: new Date(), paidBy: user.id })
    .where(eq(royaltyPayments.id, id))
    .returning({ projectId: royaltyPayments.projectId });
  if (row) await revalidate(row.projectId);
  return {};
}

export async function markRoyaltyUnpaid(id: string): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  void user;
  const [row] = await db
    .update(royaltyPayments)
    .set({ paidAt: null, paidBy: null })
    .where(eq(royaltyPayments.id, id))
    .returning({ projectId: royaltyPayments.projectId });
  if (row) await revalidate(row.projectId);
  return {};
}

// ── Scheduled MoU receivables ────────────────────────────────────────────────

const mouTriggerSchema = z.enum([
  "on_signing",
  "on_completion",
  "on_52_episodes",
  "custom",
]);

const paymentSchema = z.object({
  printRunId: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().min(0).finite(),
  dueDate: z.string().optional(),
  notes: z.string().max(500).optional(),
  publicDescription: z.string().max(500).optional(),
  trigger: mouTriggerSchema.default("custom"),
  invoiceAssigneeId: z.string().nullable().optional(),
});

const paymentEditSchema = paymentSchema.omit({ printRunId: true }).extend({
  dueDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional(),
});

export async function addPayment(
  projectId: string,
  input: z.input<typeof paymentSchema>
): Promise<{ error?: string; id?: string }> {
  const { user } = await requireRole("manager");
  const d = paymentSchema.parse(input);
  const settings = await getOrCreateBudgetSettings(projectId);
  const [created] = await db
    .insert(mouPayments)
    .values({
      projectId,
      printRunId: d.printRunId || null,
      amount: d.amount.toFixed(2),
      currency: settings.currency,
      trigger: d.trigger,
      dueDate: d.dueDate || null,
      notes: d.notes?.trim() || null,
      publicDescription: d.publicDescription?.trim() || null,
      invoiceAssigneeId: d.invoiceAssigneeId || null,
      createdBy: user.id,
    })
    .returning({ id: mouPayments.id });
  await revalidate(projectId);
  return { id: created.id };
}

/** Create two installments; any odd cent is assigned to the final payment. */
export async function splitFundingIntoTwoPayments(
  projectId: string,
  input: { printRunId?: string | null; total: number }
): Promise<{ error?: string; ids?: string[] }> {
  const { user } = await requireRole("manager");
  const parsed = z
    .object({
      printRunId: z.string().uuid().nullable().optional(),
      total: z.coerce.number().min(0.02).finite(),
    })
    .safeParse(input);
  if (!parsed.success) return { error: "Enter a total of at least 0.02." };
  const settings = await getOrCreateBudgetSettings(projectId);
  const totalCents = Math.round(parsed.data.total * 100);
  const firstCents = Math.floor(totalCents / 2);
  const amounts = [firstCents, totalCents - firstCents];
  const created = await db
    .insert(mouPayments)
    .values(
      amounts.map((amountCents, index) => ({
        projectId,
        printRunId: parsed.data.printRunId || null,
        amount: (amountCents / 100).toFixed(2),
        currency: settings.currency,
        trigger: index === 0 ? ("on_signing" as const) : ("on_completion" as const),
        notes:
          index === 0
            ? "First of two funding installments"
            : "Final funding installment on project completion",
        publicDescription:
          index === 0
            ? "Initial project funding installment"
            : "Final project funding installment",
        createdBy: user.id,
      }))
    )
    .returning({ id: mouPayments.id });
  await revalidate(projectId);
  return { ids: created.map((row) => row.id) };
}

/** Edit an unpaid scheduled receivable and keep its draft invoice/task in sync. */
export async function updatePayment(
  id: string,
  input: z.input<typeof paymentEditSchema>
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = paymentEditSchema.safeParse(input);
  if (!parsed.success) return { error: "Review the payment schedule fields." };
  const value = parsed.data;
  const [payment] = await db
    .select({
      id: mouPayments.id,
      projectId: mouPayments.projectId,
      amount: mouPayments.amount,
      currency: mouPayments.currency,
      trigger: mouPayments.trigger,
      dueDate: mouPayments.dueDate,
      notes: mouPayments.notes,
      publicDescription: mouPayments.publicDescription,
      paidAt: mouPayments.paidAt,
      sharedMouGroupId: mouPayments.sharedMouGroupId,
      invoiceAssigneeId: mouPayments.invoiceAssigneeId,
      invoiceTaskId: mouPayments.invoiceTaskId,
      invoiceId: invoices.id,
      projectTitle: projects.title,
      projectSlug: projects.slug,
    })
    .from(mouPayments)
    .innerJoin(projects, eq(projects.id, mouPayments.projectId))
    .leftJoin(
      invoices,
      and(
        eq(invoices.mouPaymentId, mouPayments.id),
        ne(invoices.status, "void")
      )
    )
    .where(eq(mouPayments.id, id))
    .limit(1);
  if (!payment) return { error: "Scheduled MoU payment not found." };
  if (payment.paidAt) {
    return { error: "Undo the received payment before editing its schedule." };
  }
  if (payment.sharedMouGroupId) {
    return { error: "Edit shared payment schedules from the agreement." };
  }
  if (payment.invoiceId) {
    return {
      error:
        "This payment has an issued invoice. Void it before changing the schedule.",
    };
  }

  const next = {
    amount: value.amount.toFixed(2),
    currency: payment.currency,
    trigger: value.trigger,
    dueDate: value.dueDate || null,
    notes: value.notes?.trim() || null,
    publicDescription: value.publicDescription?.trim() || null,
    invoiceAssigneeId: value.invoiceAssigneeId || null,
    projectTitle: payment.projectTitle,
  };
  const settings = await getOrCreateBudgetSettings(payment.projectId);
  const taskCopy = mouInvoiceTaskCopy(next, settings);

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(mouPayments)
      .set({
        amount: next.amount,
        trigger: next.trigger,
        dueDate: next.dueDate,
        notes: next.notes,
        publicDescription: next.publicDescription,
        invoiceAssigneeId: next.invoiceAssigneeId,
      })
      .where(and(eq(mouPayments.id, id), isNull(mouPayments.paidAt)))
      .returning({ id: mouPayments.id });
    if (!updated) {
      throw new Error("This payment was received while you were editing it.");
    }

    if (payment.invoiceTaskId) {
      await tx
        .update(tasks)
        .set({
          title: taskCopy.title,
          description: taskCopy.description,
          assignedTo: next.invoiceAssigneeId,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, payment.invoiceTaskId));
    }
  });

  if (
    payment.invoiceTaskId &&
    next.invoiceAssigneeId &&
    next.invoiceAssigneeId !== payment.invoiceAssigneeId &&
    next.invoiceAssigneeId !== user.id
  ) {
    await notify({
      userId: next.invoiceAssigneeId,
      type: "task_assigned",
      title: `Task assigned to you: ${taskCopy.title}`,
      project: payment.projectTitle,
      link: `/projects/${payment.projectSlug}/tasks`,
      data: {
        taskId: payment.invoiceTaskId,
        projectId: payment.projectId,
        paymentId: payment.id,
      },
    });
  }
  await logActivity({
    actorId: user.id,
    projectId: payment.projectId,
    entityType: "budget",
    entityId: payment.id,
    action: "payment_schedule",
    summary: "Updated MoU payment schedule",
  });
  await revalidate(payment.projectId);
  return {};
}

/** Void an issued invoice while retaining its immutable PDF and history. */
export async function voidMouInvoice(
  invoiceId: string
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [invoice] = await db
    .update(invoices)
    .set({
      status: "void",
      voidedAt: new Date(),
      voidedBy: user.id,
    })
    .where(and(eq(invoices.id, invoiceId), inArray(invoices.status, ["issued", "sent"])))
    .returning({ projectId: invoices.projectId, groupId: invoices.sharedMouGroupId });
  if (!invoice) return { error: "Active invoice not found." };
  if (invoice.groupId) { await reevaluateSharedMouPayments({ groupId: invoice.groupId, actorId: user.id }); revalidatePath(`/agreements/${invoice.groupId}`); }
  await revalidate(invoice.projectId);
  return {};
}

const sendInvoiceSchema = z.object({
  reviewedFileId: z.string().uuid().optional(),
  evidence: z.array(z.object({ requirement: z.string().max(500), url: z.string().max(4000), fileId: z.string().uuid().optional() })).max(30).optional(),
  confirmed: z.literal(true),
  recipientEmail: z.string().email(),
  ccEmails: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20_000),
});

/** Review-first external delivery of the immutable invoice PDF. */
export async function sendInvoiceEmail(
  invoiceId: string,
  input: z.input<typeof sendInvoiceSchema>
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const data = sendInvoiceSchema.parse(input);
  const [invoice] = await db
    .select({
      id: invoices.id,
      paymentId: invoices.mouPaymentId,
      groupId: invoices.sharedMouGroupId,
      projectId: invoices.projectId,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      renderedFileId: invoices.renderedFileId,
      sourceFileId: invoices.sourceFileId,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  const attachmentFileId = invoice?.sourceFileId ?? invoice?.renderedFileId;
  if (!invoice || !attachmentFileId) {
    return { error: "Invoice PDF not found." };
  }
  if (invoice.groupId && data.reviewedFileId !== attachmentFileId) return { error: "The invoice PDF changed. Refresh and review it before sending." };
  if (invoice.status === "void") return { error: "A void invoice cannot be sent." };
  if (invoice.status !== "issued") return { error: "This invoice was already sent or delivery is unresolved. Check correspondence before sending again." };
  if (invoice.groupId && invoice.paymentId) {
    const readiness = await getSharedPaymentReadiness(invoice.paymentId);
    if (!readiness || !["ready", "invoiced"].includes(readiness.status)) {
      return { error: readiness?.reason ?? "Payment is locked." };
    }
  }
  const [attachmentFile] = await db
    .select({
      r2Key: files.r2Key,
      originalName: files.originalName,
      mimeType: files.mimeType,
    })
    .from(files)
    .where(eq(files.id, attachmentFileId))
    .limit(1);
  if (!attachmentFile) return { error: "Invoice PDF not found." };
  const content = await getObjectBuffer(attachmentFile.r2Key);
  const [paymentEvidence] = invoice.paymentId ? await db.select({ evidence: mouPayments.deliveryEvidence })
    .from(mouPayments).where(eq(mouPayments.id, invoice.paymentId)).limit(1) : [];
  const evidence = paymentEvidence?.evidence ?? [];
  const evidenceKey = (rows: typeof evidence) => JSON.stringify(rows.map((item) =>
    [item.requirement, item.url, item.fileId ?? ""]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (evidenceKey(evidence) !== evidenceKey(data.evidence ?? [])) return { error: "Delivery evidence changed. Refresh and review the attachments before sending." };
  if (evidence.some((item) => !data.body.includes(item.url))) return { error: "Include all reviewed delivery evidence links in the outgoing message." };
  const evidenceIds = [...new Set(evidence.flatMap((item) => item.fileId ? [item.fileId] : []))];
  const evidenceFiles = evidenceIds.length ? await db.select().from(files)
    .where(and(inArray(files.id, evidenceIds), eq(files.status, "ready"))) : [];
  if (evidenceFiles.length !== evidenceIds.length) return { error: "A reviewed evidence file is unavailable. Review delivery evidence again." };
  const evidenceAttachments = await Promise.all(evidenceFiles.map(async (file) => ({
    filename: file.originalName, content: await getObjectBuffer(file.r2Key), contentType: file.mimeType,
  })));
  const claim = await db.transaction(async (tx) => {
    if (invoice.groupId && invoice.paymentId) {
      await tx.select({ id: sharedMouGroups.id }).from(sharedMouGroups)
        .where(eq(sharedMouGroups.id, invoice.groupId)).for("update");
      const [current] = await tx.select().from(mouPayments).where(eq(mouPayments.id, invoice.paymentId)).for("update");
      if (!current || evidenceKey(current.deliveryEvidence ?? []) !== evidenceKey(evidence))
        return { error: "Delivery evidence changed. Review it again before sending." };
      const readiness = await getSharedPaymentReadiness(invoice.paymentId);
      if (!readiness || !["ready", "invoiced"].includes(readiness.status))
        return { error: readiness?.reason ?? "Payment is locked." };
    }
    const [claimed] = await tx.update(invoices).set({ status: "sending" })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "issued"),
        invoice.sourceFileId ? eq(invoices.sourceFileId, attachmentFileId) : and(isNull(invoices.sourceFileId), eq(invoices.renderedFileId, attachmentFileId))))
      .returning({ id: invoices.id });
    return claimed ? {} : { error: "Invoice changed or another send is in progress. Refresh and review the PDF before retrying." };
  });
  if (claim.error) return claim;
  // A provider exception can mean accepted-but-unacknowledged delivery. Keep the
  // durable claim and draft: never automatically resend an uncertain delivery.
  const result = await sendEmail({
    to: [data.recipientEmail],
    cc: data.ccEmails ?? [],
    subject: data.subject,
    bodyText: data.body,
    attachments: [
      ...evidenceAttachments,
      {
        filename:
          attachmentFile.originalName || `invoice-${invoice.invoiceNumber}.pdf`,
        content,
        contentType: attachmentFile.mimeType || "application/pdf",
      },
    ],
    actingUserId: user.id,
  });
  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.gmailThreadId, result.threadKey))
    .limit(1);
  if (thread) {
    await db
      .update(emailThreads)
      .set({
        projectId: invoice.projectId,
        linkedManually: true,
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, thread.id));
  }
  if (thread && invoice.groupId) {
    const members = await db.select({ projectId: sharedMouMemberships.projectId }).from(sharedMouMemberships)
      .where(and(eq(sharedMouMemberships.groupId, invoice.groupId), eq(sharedMouMemberships.active, true)));
    if (members.length) await db.insert(emailThreadProjects).values(members.map((member) => ({ threadId: thread.id, projectId: member.projectId }))).onConflictDoNothing();
  }
  await db.insert(invoiceDeliveries).values({
    evidence,
    invoiceId,
    sentByUserId: user.id,
    recipientEmail: data.recipientEmail,
    ccEmails: data.ccEmails?.length ? data.ccEmails : null,
    subject: data.subject,
    emailThreadId: thread?.id ?? null,
  });
  await db
    .update(invoices)
    .set({ status: "sent" })
    .where(eq(invoices.id, invoiceId));
  if (invoice.groupId) {
    await reevaluateSharedMouPayments({ groupId: invoice.groupId, actorId: user.id });
    revalidatePath(`/agreements/${invoice.groupId}`);
  }
  await removeEmailDraftForUser(user.id, "mou_invoice", invoiceId);
  await revalidate(invoice.projectId);
  return {};
}

export async function deletePayment(id: string): Promise<void> {
  await requireRole("manager");
  const [row] = await db
    .delete(mouPayments)
    .where(eq(mouPayments.id, id))
    .returning({ projectId: mouPayments.projectId });
  if (row) await revalidate(row.projectId);
}

async function createMouInvoiceTask(
  paymentId: string,
  actorId: string | null
): Promise<{ projectId?: string; error?: string }> {
  const [pay] = await db
    .select({
      id: mouPayments.id,
      projectId: mouPayments.projectId,
      printRunId: mouPayments.printRunId,
      amount: mouPayments.amount,
      currency: mouPayments.currency,
      trigger: mouPayments.trigger,
      dueDate: mouPayments.dueDate,
      notes: mouPayments.notes,
      paidAt: mouPayments.paidAt,
      invoiceAssigneeId: mouPayments.invoiceAssigneeId,
      invoiceTaskId: mouPayments.invoiceTaskId,
      projectTitle: projects.title,
      projectSlug: projects.slug,
    })
    .from(mouPayments)
    .innerJoin(projects, eq(projects.id, mouPayments.projectId))
    .where(eq(mouPayments.id, paymentId))
    .limit(1);
  if (!pay) return { error: "Scheduled MoU payment not found." };
  if (pay.paidAt) return { projectId: pay.projectId };
  if (pay.invoiceTaskId) return { projectId: pay.projectId };
  if (!pay.invoiceAssigneeId) {
    return { error: "Assign an invoice owner before requesting an invoice." };
  }

  const settings = await getOrCreateBudgetSettings(pay.projectId);
  const { title, description } = mouInvoiceTaskCopy(pay, settings);
  const invoiceTaskDueDate = todayIso();

  const [task] = await db
    .insert(tasks)
    .values({
      projectId: pay.projectId,
      printRunId: pay.printRunId,
      title,
      description,
      status: "todo",
      priority: "high",
      assignedTo: pay.invoiceAssigneeId,
      createdBy: actorId ?? null,
      dueDate: invoiceTaskDueDate,
    })
    .returning({ id: tasks.id });

  await db
    .update(mouPayments)
    .set({ invoiceTaskId: task.id, invoiceRequestedAt: new Date() })
    .where(eq(mouPayments.id, paymentId));

  if (pay.invoiceAssigneeId !== actorId) {
    await notify({
      userId: pay.invoiceAssigneeId,
      type: "task_assigned",
      title: `Task assigned to you: ${title}`,
      body: `Due ${formatDate(invoiceTaskDueDate)}`,
      project: pay.projectTitle,
      link: `/projects/${pay.projectSlug}/tasks`,
      data: { taskId: task.id, projectId: pay.projectId, paymentId },
    });
  }
  return { projectId: pay.projectId };
}

export async function requestMouInvoice(
  paymentId: string
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [payment] = await db
    .select({ groupId: mouPayments.sharedMouGroupId })
    .from(mouPayments)
    .where(eq(mouPayments.id, paymentId))
    .limit(1);
  if (payment?.groupId) {
    const readiness = await getSharedPaymentReadiness(paymentId);
    if (!readiness || readiness.status !== "ready") {
      return { error: readiness?.reason ?? "This shared payment is locked." };
    }
    await reevaluateSharedMouPayments({
      groupId: payment.groupId,
      actorId: user.id,
    });
    revalidatePath(`/agreements/${payment.groupId}`);
    return {};
  }
  const result = await createMouInvoiceTask(paymentId, user.id);
  if (result.error) return { error: result.error };
  if (result.projectId) await revalidate(result.projectId);
  return {};
}

export async function requestCompletionMouInvoices(
  projectId: string,
  actorId?: string | null
): Promise<number> {
  const { user } = await requireRole("manager");
  const taskActorId = actorId ?? user.id;
  let created = await reevaluateSharedMouPayments({
    projectId,
    actorId: taskActorId,
  });
  const candidateRows = await db
    .select({ id: mouPayments.id })
    .from(mouPayments)
    .leftJoin(
      mouPaymentProjects,
      eq(mouPaymentProjects.paymentId, mouPayments.id)
    )
    .where(
      and(
        or(
          eq(mouPayments.projectId, projectId),
          eq(mouPaymentProjects.projectId, projectId)
        ),
        eq(mouPayments.trigger, "on_completion"),
        isNull(mouPayments.sharedMouGroupId),
        sql`${mouPayments.paidAt} is null`
      )
    );
  const paymentIds = [...new Set(candidateRows.map((payment) => payment.id))];

  for (const paymentId of paymentIds) {
    const coveredProjects = await db
      .select({ status: projects.status })
      .from(mouPaymentProjects)
      .innerJoin(projects, eq(projects.id, mouPaymentProjects.projectId))
      .where(eq(mouPaymentProjects.paymentId, paymentId));
    if (!allCoveredProjectsComplete(coveredProjects.map((project) => project.status))) {
      continue;
    }
    const before = await db
      .select({ taskId: mouPayments.invoiceTaskId })
      .from(mouPayments)
      .where(eq(mouPayments.id, paymentId))
      .limit(1);
    if (before[0]?.taskId) continue;
    const result = await createMouInvoiceTask(paymentId, taskActorId);
    if (!result.error) created += 1;
  }
  return created;
}

/**
 * Fire "after 52 episodes" receivables when the episode milestone is reached.
 * Modeled on `requestCompletionMouInvoices`, but doubly gated: an invoice task
 * is only created once the project has ≥ `PAYMENT_EPISODE_MILESTONE` published
 * episodes AND the payment's `dueDate` has arrived (the MoU's "no earlier than
 * July 2027" floor). Idempotent — `createMouInvoiceTask` skips paid/already-
 * invoiced rows — so it is safe to call on every episode publish.
 */
export async function requestEpisodeMilestoneMouInvoices(
  projectId: string,
  actorId?: string | null
): Promise<number> {
  const { user } = await requireRole("manager");
  const taskActorId = actorId ?? user.id;

  const published = await publishedEpisodeCount(projectId);
  if (published < PAYMENT_EPISODE_MILESTONE) return 0;

  const today = todayIso();
  const payments = await db
    .select({ id: mouPayments.id, dueDate: mouPayments.dueDate })
    .from(mouPayments)
    .where(
      and(
        eq(mouPayments.projectId, projectId),
        eq(mouPayments.trigger, "on_52_episodes"),
        sql`${mouPayments.paidAt} is null`
      )
    );

  let created = 0;
  for (const payment of payments) {
    // Honor the "no earlier than" floor: skip until the scheduled date arrives.
    if (payment.dueDate && today < payment.dueDate) continue;
    const before = await db
      .select({ taskId: mouPayments.invoiceTaskId })
      .from(mouPayments)
      .where(eq(mouPayments.id, payment.id))
      .limit(1);
    if (before[0]?.taskId) continue;
    const result = await createMouInvoiceTask(payment.id, taskActorId);
    if (!result.error) created += 1;
  }
  return created;
}

export async function generateMouInvoice(
  paymentId: string,
  options?: { billingAddress?: string; description?: string; regenerate?: boolean }
): Promise<{ error?: string; invoiceId?: string; invoiceNumber?: string }> {
  const { user } = await requireRole("manager");
  const parsedAddress = z.string().trim().max(1000).optional().safeParse(options?.billingAddress);
  if (!parsedAddress.success) return { error: "Keep the billing address under 1,000 characters." };
  const parsedDescription = z.string().trim().min(1).max(2000).optional().safeParse(options?.description);
  if (!parsedDescription.success) return { error: "Enter an invoice description under 2,000 characters." };
  const [pay] = await db
    .select({
      id: mouPayments.id,
      projectId: mouPayments.projectId,
      printRunId: mouPayments.printRunId,
      amount: mouPayments.amount,
      currency: mouPayments.currency,
      trigger: mouPayments.trigger,
      dueDate: mouPayments.dueDate,
      paymentDueDate: mouPayments.paymentDueDate,
      notes: mouPayments.notes,
      publicDescription: mouPayments.publicDescription,
      projectTitle: projects.title,
      sharedMouGroupId: mouPayments.sharedMouGroupId,
      groupName: sharedMouGroups.name,
      groupCounterparty: sharedMouGroups.counterparty,
      groupContactEmail: sharedMouGroups.contactEmail,
      groupContactName: sharedMouGroups.contactName,
    })
    .from(mouPayments)
    .innerJoin(projects, eq(projects.id, mouPayments.projectId))
    .leftJoin(
      sharedMouGroups,
      eq(sharedMouGroups.id, mouPayments.sharedMouGroupId)
    )
    .where(eq(mouPayments.id, paymentId))
    .limit(1);
  if (!pay) return { error: "Scheduled MoU payment not found." };
  if (Number(pay.amount) <= 0) {
    return { error: "Enter a payment amount before generating an invoice." };
  }
  if (pay.sharedMouGroupId) {
    const readiness = await getSharedPaymentReadiness(paymentId);
    if (!readiness || !["ready", "invoiced"].includes(readiness.status)) {
      return {
        error:
          readiness?.reason ??
          "This shared completion payment is still locked.",
      };
    }
  }

  const [existing] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.mouPaymentId, paymentId),
        ne(invoices.status, "void")
      )
    )
    .limit(1);
  if (existing && !options?.regenerate) {
    return { invoiceId: existing.id, invoiceNumber: existing.invoiceNumber };
  }
  if (options?.regenerate && (!pay.sharedMouGroupId || !existing || existing.status !== "issued" || existing.sourceFileId || !existing.renderedFileId)) {
    return { error: "Only an unsent, generated invoice can be regenerated. Sent, imported, or unresolved invoices keep their original PDF." };
  }
  const refreshing = options?.regenerate ? existing : undefined;
  const [voidedInvoice] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.mouPaymentId, paymentId),
        eq(invoices.status, "void")
      )
    )
    .orderBy(desc(invoices.voidedAt), desc(invoices.createdAt))
    .limit(1);

  const settings = await getOrCreateBudgetSettings(pay.projectId);
  const workspace = await getWorkspaceSettings();
  const issuerSnapshot = getInvoiceIssuerSnapshot(workspace);
  const missingIssuerFields = [
    !(issuerSnapshot.legalName?.trim() || issuerSnapshot.orgName?.trim()) && "organization name",
    !issuerSnapshot.contactEmail?.trim() && "public contact email",
    !(issuerSnapshot.paymentInstructions?.trim() || issuerSnapshot.invoicePaymentDetails?.fields.some((field) => field.value.trim())) && "payment instructions",
  ].filter(Boolean);
  if (missingIssuerFields.length) {
    return { error: `Complete your organization's ${missingIssuerFields.join(", ")} in Settings → Workspace before issuing an invoice.` };
  }
  const issueDate = refreshing?.issueDate ?? todayIso();
  const recipientEmail =
    pay.groupContactEmail?.trim() ||
    settings.partnerContactEmail?.trim() ||
    null;
  const invoiceDetails = await getMouInvoiceDetails(pay);
  const recipientName = invoiceDetails.recipientName;
  const recipientAddress = parsedAddress.data === undefined ? invoiceDetails.billingAddress || null : parsedAddress.data || null;
  const description = parsedDescription.data ?? invoiceDetails.description;
  const coveredWorks = pay.sharedMouGroupId ? await db.select({ title: projects.title }).from(sharedMouMemberships)
    .innerJoin(projects, eq(projects.id, sharedMouMemberships.projectId))
    .where(and(eq(sharedMouMemberships.groupId, pay.sharedMouGroupId), eq(sharedMouMemberships.active, true))) : [];
  const invoiceNumber = refreshing?.invoiceNumber ?? await db.transaction((tx) => nextInvoiceNumber(tx));
  const invoiceAmount = refreshing?.amount ?? pay.amount;
  const invoiceCurrency = refreshing?.currency ?? pay.currency;
  const invoiceDueDate = refreshing ? refreshing.dueDate : pay.sharedMouGroupId ? pay.paymentDueDate : pay.dueDate ?? issueDate;
  let invoiceLogo: Buffer | null = null;
  if (issuerSnapshot.logoFileId) {
    const [logo] = await db.select({ r2Key: files.r2Key, mimeType: files.mimeType }).from(files).where(eq(files.id, issuerSnapshot.logoFileId)).limit(1);
    if (logo && ["image/png", "image/jpeg"].includes(logo.mimeType)) invoiceLogo = await getObjectBuffer(logo.r2Key);
  }
  const pdf = await buildInvoicePdf({
    logo: invoiceLogo,
    issuer: issuerSnapshot,
    invoiceNumber,
    projectTitle: coveredWorks.length ? coveredWorks.map((work) => work.title).join("; ") : pay.projectTitle,
    recipientName,
    recipientEmail,
    recipientAddress,
    amount: Number(invoiceAmount),
    currency: invoiceCurrency,
    issueDate,
    dueDate: invoiceDueDate,
    description,
  });
  const fileId = randomUUID();
  const filename = `invoice-${invoiceNumber}.pdf`;
  const key = buildKey(fileId, filename);
  await putObject(key, pdf, "application/pdf");
  const invoice = await db.transaction(async (tx) => {
    if (refreshing) {
      // Serialize against send claims and other regenerations. Keep the previous
      // file intact unless this exact unsent version is still current.
      const [current] = await tx.select().from(invoices).where(eq(invoices.id, refreshing.id)).for("update");
      if (!current || current.status !== "issued" || current.sourceFileId || current.renderedFileId !== refreshing.renderedFileId) {
        return null;
      }
    }
    await tx.insert(files).values({
      id: fileId,
      r2Key: key,
      originalName: filename,
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      status: "ready",
      uploadedBy: user.id,
    });
    if (refreshing) {
      await tx.update(invoices).set({ renderedFileId: fileId, recipientName, recipientAddress, description, issuerSnapshot })
        .where(eq(invoices.id, refreshing.id));
      await tx.insert(activityLog).values({ actorId: user.id, projectId: pay.projectId,
        entityType: "budget", entityId: refreshing.id, action: "invoice",
        summary: `Regenerated invoice ${invoiceNumber}`,
        data: { previousFileId: refreshing.renderedFileId, renderedFileId: fileId },
      });
      return { id: refreshing.id, invoiceNumber };
    }
    const [created] = await tx
      .insert(invoices)
      .values({
        projectId: pay.projectId,
        printRunId: pay.printRunId,
        mouPaymentId: pay.id,
        sharedMouGroupId: pay.sharedMouGroupId,
        invoiceNumber,
        recipientName,
        recipientEmail,
        recipientAddress,
        amount: pay.amount,
        currency: pay.currency,
        issueDate,
        dueDate: pay.sharedMouGroupId ? pay.paymentDueDate : pay.dueDate ?? issueDate,
        description,
        notes: null,
        renderedFileId: fileId,
        replacesInvoiceId: voidedInvoice?.id ?? null,
        issuerSnapshot,
        createdBy: user.id,
      })
      .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });
    return created;
  });

  if (!invoice) return { error: "Invoice changed while regenerating. Refresh and review its current status before retrying." };
  if (!refreshing) await logActivity({
    actorId: user.id,
    projectId: pay.projectId,
    entityType: "budget",
    entityId: invoice.id,
    action: "invoice",
    summary: `Generated invoice ${invoice.invoiceNumber}`,
  });
  if (pay.sharedMouGroupId) {
    await reevaluateSharedMouPayments({
      groupId: pay.sharedMouGroupId,
      actorId: user.id,
    });
    revalidatePath(`/agreements/${pay.sharedMouGroupId}`);
  }
  await revalidate(pay.projectId);
  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
}

const markPaymentPaidSchema = z.object({
  actualNetAmount: z.coerce.number().min(0).finite().nullable().optional(),
  receivedDate: z.string().optional(),
});

/** Mark a scheduled receivable as received after reviewing gross and net. */
export async function markPaymentPaid(
  id: string,
  input: z.input<typeof markPaymentPaidSchema> = {}
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const received = markPaymentPaidSchema.parse(input);
  const [pay] = await db
    .select()
    .from(mouPayments)
    .where(eq(mouPayments.id, id))
    .limit(1);
  if (!pay) return { error: "Scheduled receivable not found." };
  if (pay.paidAt) return {};

  if (pay.sharedMouGroupId) {
    const [group, members] = await Promise.all([
      db
        .select()
        .from(sharedMouGroups)
        .where(eq(sharedMouGroups.id, pay.sharedMouGroupId))
        .limit(1),
      db
        .select({
          membershipId: sharedMouMemberships.id,
          projectId: sharedMouMemberships.projectId,
          amount: sharedMouMemberships.allocationAmount,
        })
        .from(sharedMouMemberships)
        .where(
          and(
            eq(sharedMouMemberships.groupId, pay.sharedMouGroupId),
            eq(sharedMouMemberships.active, true)
          )
        ),
    ]);
    if (!group[0]) return { error: "Shared MoU group not found." };
    let allocations;
    try {
      allocations = allocateSharedReceipt(
        pay.amount,
        members.map((member) => ({
          projectId: member.projectId,
          membershipId: member.membershipId,
          amount: member.amount,
        }))
      );
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Review the group allocations before recording payment.",
      };
    }
    const groupActualNet = received.actualNetAmount ?? null;
    const netAllocations =
      groupActualNet == null
        ? []
        : allocateSharedReceipt(
            groupActualNet.toFixed(2),
            members.map((member) => ({
              projectId: member.projectId,
              membershipId: member.membershipId,
              amount: member.amount,
            }))
          );
    const netByProject = new Map(
      netAllocations.map((allocation) => [
        allocation.projectId,
        allocation.amount,
      ])
    );
    const presentationPairs = await Promise.all(
      members.map(async (member) => [
        member.projectId,
        await getBudgetPresentation(member.projectId),
      ] as const)
    );
    const presentationByProject = new Map(presentationPairs);
    const deductionRates = new Set(
      presentationPairs.map(([, presentation]) => presentation?.deductionBps ?? 0)
    );
    const expectedGroupNetCents = allocations.reduce((sum, allocation) => {
      const bps =
        presentationByProject.get(allocation.projectId)?.deductionBps ?? 0;
      return (
        sum +
        expectedNetCents(
          Math.round(Number(allocation.amount) * 100),
          bps
        )
      );
    }, 0);
    await db.transaction(async (tx) => {
      const [groupReceipt] = await tx
        .insert(sharedMouReceipts)
        .values({
          groupId: pay.sharedMouGroupId!,
          paymentId: pay.id,
          amount: pay.amount,
          deductionBps:
            deductionRates.size === 1 ? [...deductionRates][0] : null,
          expectedNetAmount: (expectedGroupNetCents / 100).toFixed(2),
          actualNetAmount:
            groupActualNet == null ? null : groupActualNet.toFixed(2),
          currency: pay.currency,
          receivedDate: received.receivedDate || todayIso(),
          source: group[0].counterparty || group[0].name,
          note: pay.notes,
          recordedBy: user.id,
        })
        .returning({ id: sharedMouReceipts.id });
      for (const allocation of allocations) {
        const [projectReceipt] = await tx
          .insert(fundingReceipts)
          .values({
            projectId: allocation.projectId,
            amount: allocation.amount,
            deductionBps:
              presentationByProject.get(allocation.projectId)?.deductionBps ??
              0,
            expectedNetAmount: (
              expectedNetCents(
                Math.round(Number(allocation.amount) * 100),
                presentationByProject.get(allocation.projectId)?.deductionBps ??
                  0
              ) / 100
            ).toFixed(2),
            actualNetAmount:
              netByProject.get(allocation.projectId) ?? null,
            currency: pay.currency,
            receivedDate: received.receivedDate || todayIso(),
            source: group[0].counterparty || group[0].name,
            note: `Allocated from shared MoU “${group[0].name}”.`,
            recordedBy: user.id,
          })
          .returning({ id: fundingReceipts.id });
        await tx.insert(sharedMouReceiptAllocations).values({
          receiptId: groupReceipt.id,
          membershipId: allocation.membershipId,
          projectId: allocation.projectId,
          fundingReceiptId: projectReceipt.id,
          amount: allocation.amount,
          actualNetAmount:
            netByProject.get(allocation.projectId) ?? null,
        });
      }
      await tx
        .update(mouPayments)
        .set({
          paidAt: new Date(),
          readinessStatus: "received",
          readinessReason: "Payment received.",
          readinessEvaluatedAt: new Date(),
        })
        .where(eq(mouPayments.id, id));
    });
    await reevaluateSharedMouPayments({ groupId: pay.sharedMouGroupId, actorId: user.id });
    for (const member of members) await revalidate(member.projectId);
    revalidatePath(`/agreements/${pay.sharedMouGroupId}`);
    return {};
  }

  const settings = await getOrCreateBudgetSettings(pay.projectId);
  const net = await receiptNetValues(
    pay.projectId,
    pay.printRunId,
    Number(pay.amount),
    received.actualNetAmount
  );
  const [receipt] = await db
    .insert(fundingReceipts)
    .values({
      projectId: pay.projectId,
      printRunId: pay.printRunId,
      amount: pay.amount,
      ...net,
      currency: settings.currency,
      receivedDate: received.receivedDate || todayIso(),
      source: settings.partnerName || "MoU receivable",
      note: pay.notes,
      recordedBy: user.id,
    })
    .returning({ id: fundingReceipts.id });

  await db
    .update(mouPayments)
    .set({ paidAt: new Date(), receiptId: receipt.id })
    .where(eq(mouPayments.id, id));
  await revalidate(pay.projectId);
  return {};
}

/** Undo a received mark — removes the linked receipt. */
export async function markPaymentUnpaid(id: string): Promise<void> {
  await requireRole("manager");
  const [pay] = await db
    .select({
      projectId: mouPayments.projectId,
      receiptId: mouPayments.receiptId,
      sharedMouGroupId: mouPayments.sharedMouGroupId,
    })
    .from(mouPayments)
    .where(eq(mouPayments.id, id))
    .limit(1);
  if (!pay) return;
  if (pay.sharedMouGroupId) {
    const [groupReceipt] = await db
      .select({ id: sharedMouReceipts.id })
      .from(sharedMouReceipts)
      .where(eq(sharedMouReceipts.paymentId, id))
      .limit(1);
    if (groupReceipt) {
      const allocations = await db
        .select({
          projectId: sharedMouReceiptAllocations.projectId,
          fundingReceiptId: sharedMouReceiptAllocations.fundingReceiptId,
        })
        .from(sharedMouReceiptAllocations)
        .where(eq(sharedMouReceiptAllocations.receiptId, groupReceipt.id));
      await db.transaction(async (tx) => {
        await tx
          .delete(sharedMouReceiptAllocations)
          .where(eq(sharedMouReceiptAllocations.receiptId, groupReceipt.id));
        for (const allocation of allocations) {
          await tx
            .delete(fundingReceipts)
            .where(eq(fundingReceipts.id, allocation.fundingReceiptId));
        }
        await tx
          .delete(sharedMouReceipts)
          .where(eq(sharedMouReceipts.id, groupReceipt.id));
        await tx
          .update(mouPayments)
          .set({ paidAt: null, readinessStatus: "locked", receiptId: null })
          .where(eq(mouPayments.id, id));
      });
      for (const allocation of allocations) await revalidate(allocation.projectId);
    }
    await reevaluateSharedMouPayments({ groupId: pay.sharedMouGroupId });
    revalidatePath(`/agreements/${pay.sharedMouGroupId}`);
    return;
  }
  if (pay.receiptId) {
    await db.delete(fundingReceipts).where(eq(fundingReceipts.id, pay.receiptId));
  }
  await db
    .update(mouPayments)
    .set({ paidAt: null, receiptId: null })
    .where(eq(mouPayments.id, id));
  await revalidate(pay.projectId);
}
