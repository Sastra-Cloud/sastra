"use server";

import { clearOverdueNotificationsForTasks } from "@/lib/notifications";
import { printerPaymentTaskTitle, printerPaymentTaskDescription } from "@/lib/print/payment-task-copy";
import { reviewWirePayment } from "@/lib/print/wire-payment-review";
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { aiStructured } from "@/lib/ai/openrouter";
import { requireRole } from "@/lib/auth/guards";
import { scheduleHealthRecompute } from "@/lib/blockers/engine";
import { lineAmount, lineQuantity } from "@/lib/budget/compute";
import { db } from "@/lib/db";
import {
  budgetItems,
  budgetScopePresentations,
  emailDrafts,
  emailMessages,
  emailThreads,
  fileAttachments,
  files,
  printContacts,
  printEmailLessons,
  printExtractionJobs,
  printPayments,
  printQuotes,
  printRuns,
  projectPrintSettings,
  projectBudgetSettings,
  projects,
  tasks,
  user,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/gmail";
import { getObjectBuffer } from "@/lib/r2";
import { logActivity } from "@/lib/activity/log";
import { linkPrintThread } from "@/lib/print/email-link";
import {
  DEFAULT_FINANCIAL_EMAIL,
  DEFAULT_PRINT_CC_EMAILS,
  chooseEstimateQuote,
  estimatePrintPages,
  formatTrimSize,
  measurementUnit,
} from "@/lib/print/estimate";
import { getOrCreateBudgetSettings } from "@/lib/budget/queries";
import { syncBudgetApprovalState } from "@/lib/budget/approval-service";
import { selfCheckFlags } from "@/lib/print/cross-check";
import {
  syncAcceptedQuoteToRunBudget,
  syncPrintEstimateToBudget,
} from "@/lib/print/budget-sync";
import { advancePrintRunStatus } from "@/lib/print/run-status";
import { runTextQuoteExtraction } from "@/lib/print/email-text-extract";
import {
  acceptedQuotePaymentPlan,
  invoiceFilePaymentKinds,
} from "@/lib/print/quote-reconciliation";
import { quoteRunSpecPatch } from "@/lib/print/quote-run-specs";
import {
  ensurePrintPaymentTask,
  syncPrintPaymentTaskStatus,
} from "@/lib/print/payment-tasks";
import {
  extractPrintInvoice,
  insertSuggestedQuote,
  runPrintQuoteExtraction,
  syncAcceptedInvoiceFiles,
} from "@/lib/print/extract";
import {
  getBudgetPageBasis,
  getOrCreatePrintSettings,
  getRunWithProject,
} from "@/lib/print/queries";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import {
  buildOperationalDraftSystemPrompt,
  printRfqFallback,
  wireRequestFallback,
} from "@/lib/email/operational-drafts";
import { formatDate } from "@/lib/format";
import { removeEmailDraftForUser } from "@/lib/email/draft-store";

async function projectMeta(projectId: string) {
  const [project] = await db
    .select({ slug: projects.slug, title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project ?? null;
}

async function revalidatePrint(projectId: string, opts?: { budget?: boolean }) {
  if (opts?.budget) await syncBudgetApprovalState(projectId);
  const project = await projectMeta(projectId);
  if (!project) return;
  revalidatePath(`/projects/${project.slug}/print`);
  revalidatePath(`/projects/${project.slug}`);
  if (opts?.budget) revalidatePath(`/projects/${project.slug}/budget`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
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

function csvEmails(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? "").split(/[,\n;]/);
  return [
    ...new Set(
      parts
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p.length > 0)
    ),
  ];
}

function invalidEmails(emails: string[]): string[] {
  const schema = z.string().email();
  return emails.filter((email) => !schema.safeParse(email).success);
}

async function estimateForProject(projectId: string, input: {
  trimWidthIn: string | number;
  trimHeightIn: string | number;
  languageExpansionFactor: string | number;
}) {
  const basis = await getBudgetPageBasis(projectId);
  return estimatePrintPages({
    wordCount: basis.wordCount,
    wordsPerPage: basis.wordsPerPage,
    sourcePageCount: basis.sourcePageCount,
    trimWidthIn: input.trimWidthIn,
    trimHeightIn: input.trimHeightIn,
    languageExpansionFactor: input.languageExpansionFactor,
  });
}

async function refreshRunEstimatedTextPages(run: typeof printRuns.$inferSelect) {
  const estimatedTextPages = await estimateForProject(run.projectId, {
    trimWidthIn: run.trimWidthIn,
    trimHeightIn: run.trimHeightIn,
    languageExpansionFactor: run.languageExpansionFactor,
  });

  if (estimatedTextPages !== run.estimatedTextPages) {
    await db
      .update(printRuns)
      .set({ estimatedTextPages, updatedAt: new Date() })
      .where(eq(printRuns.id, run.id));
    await revalidatePrint(run.projectId);
  }

  return estimatedTextPages;
}

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  domain: z.string().max(200).optional(),
  phone: z.string().max(80).optional(),
  notes: z.string().max(1000).optional(),
});

export async function createPrintContact(input: z.input<typeof contactSchema>) {
  const { user } = await requireRole("manager");
  const data = contactSchema.parse(input);
  const [row] = await db
    .insert(printContacts)
    .values({
      name: data.name.trim(),
      company: data.company?.trim() || null,
      email: data.email?.trim().toLowerCase() || null,
      domain: data.domain?.trim().toLowerCase() || null,
      phone: data.phone?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .returning({ id: printContacts.id });
  await logActivity({
    actorId: user.id,
    entityType: "settings",
    action: "print_contact",
    summary: `Added print contact "${data.name.trim()}"`,
  });
  revalidatePath("/settings", "layout");
  return { id: row.id };
}

const settingsSchema = z.object({
  defaultContactId: z.string().uuid().nullable().optional(),
  trimWidthIn: z.coerce.number().min(1).max(20).optional(),
  trimHeightIn: z.coerce.number().min(1).max(20).optional(),
  measurementUnit: z.enum(["in", "mm"]).optional(),
  sourcePageCount: z.coerce.number().int().min(0).optional(),
  languageExpansionFactor: z.coerce.number().min(0.5).max(3).optional(),
  financialEmail: z.string().email().optional().or(z.literal("")),
  ccEmails: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function updatePrintSettings(
  projectId: string,
  input: z.input<typeof settingsSchema>
) {
  const { user } = await requireRole("manager");
  const data = settingsSchema.parse(input);
  await getOrCreatePrintSettings(projectId);
  if (data.sourcePageCount !== undefined) {
    await getOrCreateBudgetSettings(projectId);
  }

  const patch: Partial<typeof projectPrintSettings.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (data.defaultContactId !== undefined)
    patch.defaultContactId = data.defaultContactId || null;
  if (data.trimWidthIn !== undefined) patch.trimWidthIn = data.trimWidthIn.toFixed(2);
  if (data.trimHeightIn !== undefined)
    patch.trimHeightIn = data.trimHeightIn.toFixed(2);
  if (data.measurementUnit !== undefined)
    patch.measurementUnit = data.measurementUnit;
  if (data.languageExpansionFactor !== undefined)
    patch.languageExpansionFactor = data.languageExpansionFactor.toFixed(2);
  if (data.financialEmail !== undefined) patch.financialEmail = data.financialEmail;
  if (data.ccEmails !== undefined) {
    const ccEmails = csvEmails(data.ccEmails);
    const invalid = invalidEmails(ccEmails);
    if (invalid.length) return { error: `Check CC email: ${invalid[0]}` };
    patch.ccEmails = ccEmails;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(projectPrintSettings)
      .set(patch)
      .where(eq(projectPrintSettings.projectId, projectId));

    if (data.sourcePageCount !== undefined) {
      await tx
        .update(projectBudgetSettings)
        .set({ sourcePageCount: data.sourcePageCount, updatedAt: new Date() })
        .where(eq(projectBudgetSettings.projectId, projectId));
    }
  });

  if (
    data.sourcePageCount !== undefined ||
    data.languageExpansionFactor !== undefined
  ) {
    const basis = await getBudgetPageBasis(projectId);
    const printSettings = await getOrCreatePrintSettings(projectId);
    const quantity = String(
      lineQuantity("pages", {
        wordCount: basis.wordCount,
        wordsPerPage: basis.wordsPerPage,
        sourcePageCount: basis.sourcePageCount,
        languageExpansionFactor: printSettings.languageExpansionFactor,
      }),
    );
    const typesettingLines = await db
      .select({ id: budgetItems.id, unitPrice: budgetItems.unitPrice })
      .from(budgetItems)
      .where(
        and(
          eq(budgetItems.projectId, projectId),
          eq(budgetItems.category, "typesetting"),
          eq(budgetItems.isAutoQuantity, true),
        ),
      );

    await db.transaction(async (tx) => {
      for (const line of typesettingLines) {
        await tx
          .update(budgetItems)
          .set({
            quantity,
            amount: lineAmount(quantity, line.unitPrice),
            updatedAt: new Date(),
          })
          .where(eq(budgetItems.id, line.id));
      }
    });

    // The target-language page estimate is stored per run; recompute existing
    // runs so a changed source page count / expansion factor is not stale.
    const runs = await db
      .select()
      .from(printRuns)
      .where(eq(printRuns.projectId, projectId));
    for (const run of runs) {
      await refreshRunEstimatedTextPages(run);
    }
  }

  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "print",
    action: "settings",
    summary: "Updated print settings",
  });
  await revalidatePrint(projectId, { budget: true });
  return {};
}

const runSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  kind: z.enum(["first_print", "reprint"]).optional(),
  status: z.string().min(1).max(80).optional(),
  sourceRunId: z.string().uuid().nullable().optional(),
  printNumber: z.coerce.number().int().min(1).nullable().optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignDueDate: z.string().nullable().optional(),
  fundingGoal: z.coerce.number().min(0).nullable().optional(),
  fundingCurrency: z.string().min(1).max(8).optional(),
  reprintReason: z.string().max(1000).optional(),
  contactId: z.string().uuid().nullable().optional(),
  quantityTarget: z.coerce.number().int().min(0).nullable().optional(),
  requestedQuantities: z.array(z.coerce.number().int().min(1)).optional(),
  trimWidthIn: z.coerce.number().min(1).max(20).optional(),
  trimHeightIn: z.coerce.number().min(1).max(20).optional(),
  languageExpansionFactor: z.coerce.number().min(0.5).max(3).optional(),
  quotedTextPages: z.coerce.number().int().min(0).nullable().optional(),
  coverPages: z.coerce.number().int().min(0).optional(),
  textPaper: z.string().max(500).optional(),
  coverPaper: z.string().max(500).optional(),
  binding: z.string().max(300).optional(),
  deliveryLocation: z.string().max(200).optional(),
  latestProofUrl: z.string().url().nullable().optional().or(z.literal("")),
  notes: z.string().max(2000).optional(),
});

export async function createPrintRun(
  projectId: string,
  input: z.input<typeof runSchema>
) {
  const { user } = await requireRole("manager");
  const data = runSchema.parse(input);
  const [project] = await db
    .select({ title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: "Project not found." };

  const [settings, workspace] = await Promise.all([
    getOrCreatePrintSettings(projectId),
    getWorkspaceSettings(),
  ]);
  const trimWidthIn = data.trimWidthIn ?? Number(settings.trimWidthIn);
  const trimHeightIn = data.trimHeightIn ?? Number(settings.trimHeightIn);
  const languageExpansionFactor =
    data.languageExpansionFactor ?? Number(settings.languageExpansionFactor);
  const estimatedTextPages = await estimateForProject(projectId, {
    trimWidthIn,
    trimHeightIn,
    languageExpansionFactor,
  });

  const [run] = await db
    .insert(printRuns)
    .values({
      projectId,
      sourceRunId: data.sourceRunId ?? null,
      contactId: data.contactId ?? settings.defaultContactId,
      title: data.title?.trim() || project.title,
      kind: data.kind ?? "first_print",
      status: data.status ?? "planning",
      printNumber:
        data.printNumber ?? (data.kind === "reprint" ? null : 1),
      campaignStartDate: data.campaignStartDate || null,
      campaignDueDate: data.campaignDueDate || null,
      fundingGoal:
        data.fundingGoal != null && data.fundingGoal > 0
          ? data.fundingGoal.toFixed(2)
          : null,
      fundingCurrency: data.fundingCurrency ?? "USD",
      reprintReason: data.reprintReason?.trim() || null,
      quantityTarget: data.quantityTarget ?? null,
      requestedQuantities: data.requestedQuantities?.length
        ? data.requestedQuantities
        : [1000, 2000, 3000, 4000, 5000],
      trimWidthIn: trimWidthIn.toFixed(2),
      trimHeightIn: trimHeightIn.toFixed(2),
      languageExpansionFactor: languageExpansionFactor.toFixed(2),
      estimatedTextPages,
      coverPages: data.coverPages ?? 4,
      textPaper: data.textPaper?.trim() || null,
      coverPaper: data.coverPaper?.trim() || null,
      binding: data.binding?.trim() || null,
      deliveryLocation:
        data.deliveryLocation?.trim() || workspace.defaultDeliveryLocation || "",
      latestProofUrl: data.latestProofUrl || null,
      notes: data.notes?.trim() || null,
      createdBy: user.id,
    })
    .returning({ id: printRuns.id });
  if ((data.kind ?? "first_print") === "reprint") {
    await db.insert(budgetScopePresentations).values({
      projectId,
      printRunId: run.id,
      mode: "itemized",
      deductionBps: workspace.defaultFundingDeductionBps,
      createdBy: user.id,
      updatedBy: user.id,
    });
  }
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "print",
    entityId: run.id,
    action: "run",
    summary: `Created print run "${data.title?.trim() || project.title}"`,
  });
  await syncPrintEstimateToBudget(projectId);
  await revalidatePrint(projectId, { budget: true });
  return { id: run.id };
}

const reprintSchema = z.object({
  sourceRunId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(240).optional(),
  printNumber: z.coerce.number().int().min(2).nullable().optional(),
  campaignStartDate: z.string().nullable().optional(),
  campaignDueDate: z.string().nullable().optional(),
  fundingGoal: z.coerce.number().min(0).nullable().optional(),
  fundingCurrency: z.string().min(1).max(8).optional(),
  reprintReason: z.string().max(1000).optional(),
  requestedQuantities: z.array(z.coerce.number().int().min(1)).optional(),
  contactId: z.string().uuid().nullable().optional(),
});

const REPRINT_TASKS = [
  {
    title: "Confirm rights allow this reprint",
    priority: "high",
    description:
      "Check the MoU/license terms and renewal dates before committing printer money.",
  },
  {
    title: "Confirm source files and latest proof",
    priority: "medium",
    description:
      "Make sure the print-ready interior, cover, and latest proof link are the files for this reprint.",
  },
  {
    title: "Request printer quote for reprint",
    priority: "high",
    description:
      "Ask the printer for current price tiers using this reprint run's quantities and specs.",
  },
  {
    title: "Secure sponsor, MoU, or donation for reprint",
    priority: "high",
    description:
      "Record scheduled MoU payments or donations against this reprint run so the budget view shows only reprint funding.",
  },
  {
    title: "Approve reprint proof",
    priority: "high",
    description:
      "Review the printer proof and save the approved proof link on the print run.",
  },
  {
    title: "Request deposit or wire payment",
    priority: "high",
    description:
      "Attach the printer invoice and send the finance request from the print run.",
  },
  {
    title: "Track reprint production",
    priority: "medium",
    description: "Follow up with the printer until production is complete.",
  },
  {
    title: "Confirm reprint delivery",
    priority: "medium",
    description: "Confirm delivery location, quantity received, and any issues.",
  },
  {
    title: "Close final payment and archive reprint",
    priority: "medium",
    description:
      "Mark final printer payments paid, close remaining funding records, and set the reprint run completed.",
  },
] as const;

export async function startReprint(
  projectId: string,
  input: z.input<typeof reprintSchema>
) {
  const { user } = await requireRole("manager");
  const data = reprintSchema.parse(input);
  const [project] = await db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { error: "Project not found." };

  const [settings, workspace] = await Promise.all([
    getOrCreatePrintSettings(projectId),
    getWorkspaceSettings(),
  ]);
  const sourceRun = data.sourceRunId
    ? (
        await db
          .select()
          .from(printRuns)
          .where(
            and(
              eq(printRuns.id, data.sourceRunId),
              eq(printRuns.projectId, projectId)
            )
          )
          .limit(1)
      )[0]
    : (
        await db
          .select()
          .from(printRuns)
          .where(eq(printRuns.projectId, projectId))
          .orderBy(desc(printRuns.createdAt))
          .limit(1)
      )[0];
  if (data.sourceRunId && !sourceRun) return { error: "Source run not found." };

  const existingRuns = await db
    .select({ printNumber: printRuns.printNumber, kind: printRuns.kind })
    .from(printRuns)
    .where(eq(printRuns.projectId, projectId));
  const maxPrintNumber = existingRuns.reduce((max, run) => {
    const n = run.printNumber ?? (run.kind === "first_print" ? 1 : 0);
    return Math.max(max, n);
  }, 1);
  const printNumber = data.printNumber ?? maxPrintNumber + 1;
  const fundingCurrency = data.fundingCurrency || sourceRun?.fundingCurrency || "USD";
  const trimWidthIn = Number(sourceRun?.trimWidthIn ?? settings.trimWidthIn);
  const trimHeightIn = Number(sourceRun?.trimHeightIn ?? settings.trimHeightIn);
  const languageExpansionFactor = Number(
    sourceRun?.languageExpansionFactor ?? settings.languageExpansionFactor
  );
  const estimatedTextPages = await estimateForProject(projectId, {
    trimWidthIn,
    trimHeightIn,
    languageExpansionFactor,
  });
  const fundingGoal =
    data.fundingGoal != null && data.fundingGoal > 0 ? data.fundingGoal : null;

  const [createdRun] = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(printRuns)
      .values({
        projectId,
        sourceRunId: sourceRun?.id ?? null,
        contactId: data.contactId ?? sourceRun?.contactId ?? settings.defaultContactId,
        title:
          data.title?.trim() ||
          `${project.title} reprint ${printNumber.toLocaleString()}`,
        kind: "reprint",
        printNumber,
        status: fundingGoal ? "seeking_funding" : "planning",
        campaignStartDate: data.campaignStartDate || null,
        campaignDueDate: data.campaignDueDate || null,
        fundingGoal: fundingGoal ? fundingGoal.toFixed(2) : null,
        fundingCurrency,
        reprintReason: data.reprintReason?.trim() || null,
        quantityTarget: null,
        requestedQuantities: data.requestedQuantities?.length
          ? data.requestedQuantities
          : sourceRun?.requestedQuantities?.length
            ? sourceRun.requestedQuantities
            : [1000, 2000, 3000, 4000, 5000],
        trimWidthIn: trimWidthIn.toFixed(2),
        trimHeightIn: trimHeightIn.toFixed(2),
        languageExpansionFactor: languageExpansionFactor.toFixed(2),
        estimatedTextPages,
        quotedTextPages: sourceRun?.quotedTextPages ?? null,
        coverPages: sourceRun?.coverPages ?? 4,
        textPaper: sourceRun?.textPaper ?? null,
        coverPaper: sourceRun?.coverPaper ?? null,
        binding: sourceRun?.binding ?? null,
        deliveryLocation: sourceRun?.deliveryLocation ?? "",
        latestProofUrl: sourceRun?.latestProofUrl ?? null,
        notes: sourceRun
          ? `Copied specs from ${sourceRun.title}.`
          : "Started as a reprint campaign.",
      createdBy: user.id,
    })
      .returning();

    await tx.insert(budgetScopePresentations).values({
      projectId,
      printRunId: run.id,
      mode: "itemized",
      deductionBps: workspace.defaultFundingDeductionBps,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await tx.insert(tasks).values(
      REPRINT_TASKS.map((task, index) => ({
        projectId,
        printRunId: run.id,
        title: task.title,
        description: task.description,
        status: "todo" as const,
        priority: task.priority,
        createdBy: user.id,
        dueDate:
          index >= REPRINT_TASKS.length - 2
            ? data.campaignDueDate || null
            : null,
        orderIndex: index,
      }))
    );

    return [run];
  });

  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "print",
    entityId: createdRun.id,
    action: "reprint",
    summary: `Started reprint ${printNumber} for "${project.title}"`,
  });
  await revalidatePrint(projectId, { budget: true });
  return { id: createdRun.id };
}

export async function updatePrintRun(
  runId: string,
  input: z.input<typeof runSchema>
) {
  const { user } = await requireRole("manager");
  const data = runSchema.parse(input);
  const [run] = await db.select().from(printRuns).where(eq(printRuns.id, runId)).limit(1);
  if (!run) return { error: "Print run not found." };

  const trimWidthIn = data.trimWidthIn ?? Number(run.trimWidthIn);
  const trimHeightIn = data.trimHeightIn ?? Number(run.trimHeightIn);
  const languageExpansionFactor =
    data.languageExpansionFactor ?? Number(run.languageExpansionFactor);
  const estimatedTextPages = await estimateForProject(run.projectId, {
    trimWidthIn,
    trimHeightIn,
    languageExpansionFactor,
  });

  const patch: Partial<typeof printRuns.$inferInsert> = {
    updatedAt: new Date(),
    estimatedTextPages,
  };
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.kind !== undefined) patch.kind = data.kind;
  if (data.status !== undefined) patch.status = data.status;
  if (data.sourceRunId !== undefined) patch.sourceRunId = data.sourceRunId || null;
  if (data.printNumber !== undefined) patch.printNumber = data.printNumber;
  if (data.campaignStartDate !== undefined)
    patch.campaignStartDate = data.campaignStartDate || null;
  if (data.campaignDueDate !== undefined)
    patch.campaignDueDate = data.campaignDueDate || null;
  if (data.fundingGoal !== undefined)
    patch.fundingGoal =
      data.fundingGoal != null && data.fundingGoal > 0
        ? data.fundingGoal.toFixed(2)
        : null;
  if (data.fundingCurrency !== undefined)
    patch.fundingCurrency = data.fundingCurrency;
  if (data.reprintReason !== undefined)
    patch.reprintReason = data.reprintReason.trim() || null;
  if (data.contactId !== undefined) patch.contactId = data.contactId || null;
  if (data.quantityTarget !== undefined) patch.quantityTarget = data.quantityTarget;
  if (data.requestedQuantities !== undefined)
    patch.requestedQuantities = data.requestedQuantities;
  if (data.trimWidthIn !== undefined) patch.trimWidthIn = data.trimWidthIn.toFixed(2);
  if (data.trimHeightIn !== undefined) patch.trimHeightIn = data.trimHeightIn.toFixed(2);
  if (data.languageExpansionFactor !== undefined)
    patch.languageExpansionFactor = data.languageExpansionFactor.toFixed(2);
  if (data.quotedTextPages !== undefined) patch.quotedTextPages = data.quotedTextPages;
  if (data.coverPages !== undefined) patch.coverPages = data.coverPages;
  if (data.textPaper !== undefined) patch.textPaper = data.textPaper.trim() || null;
  if (data.coverPaper !== undefined) patch.coverPaper = data.coverPaper.trim() || null;
  if (data.binding !== undefined) patch.binding = data.binding.trim() || null;
  if (data.deliveryLocation !== undefined)
    patch.deliveryLocation = data.deliveryLocation.trim();
  if (data.latestProofUrl !== undefined) patch.latestProofUrl = data.latestProofUrl || null;
  if (data.notes !== undefined) patch.notes = data.notes.trim() || null;

  await db.update(printRuns).set(patch).where(eq(printRuns.id, runId));
  await logActivity({
    actorId: user.id,
    projectId: run.projectId,
    entityType: "print",
    entityId: runId,
    action: "run",
    summary: `Updated print run "${run.title}"`,
  });
  await syncPrintEstimateToBudget(run.projectId);
  await revalidatePrint(run.projectId, { budget: true });
  return {};
}

export async function deletePrintRun(runId: string) {
  const { user } = await requireRole("manager");
  const [row] = await db
    .delete(printRuns)
    .where(eq(printRuns.id, runId))
    .returning({ projectId: printRuns.projectId, title: printRuns.title });
  if (!row) return {};
  await logActivity({
    actorId: user.id,
    projectId: row.projectId,
    entityType: "print",
    action: "run",
    summary: `Deleted print run "${row.title}"`,
  });
  await syncPrintEstimateToBudget(row.projectId);
  await revalidatePrint(row.projectId, { budget: true });
  return {};
}

export async function createQuoteFromText(runId: string, text: string) {
  const { user } = await requireRole("manager");
  const [run] = await db.select().from(printRuns).where(eq(printRuns.id, runId)).limit(1);
  if (!run) return { error: "Print run not found." };

  // AI-first extraction, cross-checked against the regex parser, same as the
  // auto email path. Manual paste has no source message, so nothing is deduped.
  const res = await runTextQuoteExtraction({
    bodyText: text,
    includeQuotedHistory: true,
    projectId: run.projectId,
    runId: run.id,
    actorUserId: user.id,
  });
  if (res.created === 0) {
    return { error: "No printer quote details were found in that text." };
  }
  await logActivity({
    actorId: user.id,
    projectId: run.projectId,
    entityType: "print",
    action: "quote",
    summary:
      res.created > 1
        ? `Parsed ${res.created} print quote tiers for "${run.title}"`
        : `Parsed print quote for "${run.title}"`,
  });
  await revalidatePrint(run.projectId);
  return { count: res.created };
}

/**
 * Retry a failed extraction job (manager action from the print manager). Re-runs
 * the same job-backed extractor, which finds the existing non-succeeded job and
 * re-attempts it.
 */
export async function retryExtraction(jobId: string) {
  const { user } = await requireRole("manager");
  const [job] = await db
    .select()
    .from(printExtractionJobs)
    .where(eq(printExtractionJobs.id, jobId))
    .limit(1);
  if (!job) return { error: "Extraction job not found." };
  if (!job.runId) return { error: "This job has no print run to attach to." };

  if (job.kind === "pdf") {
    if (!job.fileId) return { error: "This job has no file to re-extract." };
    await extractPrintInvoice({
      fileId: job.fileId,
      runId: job.runId,
      sourceThreadId: job.sourceThreadId,
      sourceMessageId: job.sourceMessageId,
    });
  } else {
    if (!job.sourceMessageId) return { error: "This job has no source message." };
    const [msg] = await db
      .select({
        bodyText: emailMessages.bodyText,
        forwardedByUserId: emailMessages.forwardedByUserId,
      })
      .from(emailMessages)
      .where(eq(emailMessages.id, job.sourceMessageId))
      .limit(1);
    await runTextQuoteExtraction({
      bodyText: msg?.bodyText ?? null,
      includeQuotedHistory: !!msg?.forwardedByUserId,
      projectId: job.projectId,
      runId: job.runId,
      sourceThreadId: job.sourceThreadId,
      sourceMessageId: job.sourceMessageId,
      actorUserId: user.id,
    });
  }
  await revalidatePrint(job.projectId);
  return {};
}

/**
 * Create a `suggested` quote by extracting an uploaded printer invoice PDF or
 * image with the vision model (manual backfill for the auto email path).
 */
export async function createQuoteFromFile(runId: string, fileId: string) {
  const { user } = await requireRole("manager");
  const [run] = await db.select().from(printRuns).where(eq(printRuns.id, runId)).limit(1);
  if (!run) return { error: "Print run not found." };

  let parsed;
  try {
    parsed = await runPrintQuoteExtraction({
      fileId,
      projectId: run.projectId,
      actorUserId: user.id,
      runId,
    });
  } catch (e) {
    return { error: (e as Error).message || "Could not read the file." };
  }
  if (!parsed) return { error: "That file isn't ready or couldn't be read." };

  const quoteId = await insertSuggestedQuote(run, parsed, user.id, {
    reviewFlags: selfCheckFlags(parsed, { rawIssueDate: parsed.issueDate }),
    extractionSource: "pdf_ai",
  });
  await db.insert(fileAttachments).values({
    fileId,
    targetType: "print_quote",
    targetId: quoteId,
    label: "invoice",
  });
  await logActivity({
    actorId: user.id,
    projectId: run.projectId,
    entityType: "print",
    entityId: quoteId,
    action: "quote",
    summary: `Extracted print quote for "${run.title}"`,
  });
  await revalidatePrint(run.projectId);
  return { id: quoteId };
}

const quoteEditSchema = z.object({
  kind: z
    .enum(["quote", "invoice", "deposit_invoice", "final_invoice"])
    .optional(),
  quantityCps: z.coerce.number().int().min(0).nullable().optional(),
  unitPrice: z.coerce.number().min(0).nullable().optional(),
  totalAmount: z.coerce.number().min(0).nullable().optional(),
  depositAmount: z.coerce.number().min(0).nullable().optional(),
  balanceAmount: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().min(1).max(8).optional(),
  trimWidthMm: z.coerce.number().min(1).max(1000).nullable().optional(),
  trimHeightMm: z.coerce.number().min(1).max(1000).nullable().optional(),
  textPages: z.coerce.number().int().min(0).nullable().optional(),
  coverPages: z.coerce.number().int().min(0).nullable().optional(),
  textSpec: z.string().max(500).nullable().optional(),
  coverSpec: z.string().max(500).nullable().optional(),
  binding: z.string().max(300).nullable().optional(),
  deliveryLocation: z.string().max(200).nullable().optional(),
  invoiceNumber: z.string().max(120).nullable().optional(),
});

/** Correct fields on a not-yet-accepted quote (e.g. an AI misread). */
export async function updatePrintQuote(
  quoteId: string,
  input: z.input<typeof quoteEditSchema>
) {
  const { user } = await requireRole("manager");
  const data = quoteEditSchema.parse(input);
  const [quote] = await db
    .select()
    .from(printQuotes)
    .where(eq(printQuotes.id, quoteId))
    .limit(1);
  if (!quote) return { error: "Quote not found." };
  if (quote.reviewStatus === "accepted")
    return { error: "Accepted quotes can't be edited." };

  const patch: Partial<typeof printQuotes.$inferInsert> = { updatedAt: new Date() };
  if (data.kind !== undefined) patch.kind = data.kind;
  if (data.quantityCps !== undefined) patch.quantityCps = data.quantityCps;
  if (data.unitPrice !== undefined)
    patch.unitPrice = data.unitPrice == null ? null : data.unitPrice.toFixed(3);
  if (data.totalAmount !== undefined)
    patch.totalAmount = data.totalAmount == null ? null : data.totalAmount.toFixed(2);
  if (data.depositAmount !== undefined)
    patch.depositAmount =
      data.depositAmount == null ? null : data.depositAmount.toFixed(2);
  if (data.balanceAmount !== undefined)
    patch.balanceAmount =
      data.balanceAmount == null ? null : data.balanceAmount.toFixed(2);
  if (data.currency !== undefined) patch.currency = data.currency;
  if (data.trimWidthMm !== undefined)
    patch.trimWidthMm =
      data.trimWidthMm == null ? null : data.trimWidthMm.toFixed(2);
  if (data.trimHeightMm !== undefined)
    patch.trimHeightMm =
      data.trimHeightMm == null ? null : data.trimHeightMm.toFixed(2);
  if (data.textPages !== undefined) patch.textPages = data.textPages;
  if (data.coverPages !== undefined) patch.coverPages = data.coverPages;
  if (data.textSpec !== undefined)
    patch.textSpec = data.textSpec?.trim() || null;
  if (data.coverSpec !== undefined)
    patch.coverSpec = data.coverSpec?.trim() || null;
  if (data.binding !== undefined)
    patch.binding = data.binding?.trim() || null;
  if (data.deliveryLocation !== undefined)
    patch.deliveryLocation = data.deliveryLocation?.trim() || null;
  if (data.invoiceNumber !== undefined)
    patch.invoiceNumber = data.invoiceNumber?.trim() || null;

  await db.update(printQuotes).set(patch).where(eq(printQuotes.id, quoteId));
  await syncPrintEstimateToBudget(quote.projectId);
  await logActivity({
    actorId: user.id,
    projectId: quote.projectId,
    entityType: "print",
    entityId: quoteId,
    action: "quote",
    summary: "Edited print quote",
  });
  await revalidatePrint(quote.projectId, { budget: true });
  return {};
}

async function createPaymentsForQuote(quoteId: string) {
  const [quote] = await db
    .select()
    .from(printQuotes)
    .where(eq(printQuotes.id, quoteId))
    .limit(1);
  if (!quote) return [];
  const existing = await db
    .select({
      id: printPayments.id,
      kind: printPayments.kind,
      quoteId: printPayments.quoteId,
      status: printPayments.status,
      amount: printPayments.amount,
      currency: printPayments.currency,
      wireRequestedAt: printPayments.wireRequestedAt,
      paidAt: printPayments.paidAt,
    })
    .from(printPayments)
    .where(eq(printPayments.runId, quote.runId));

  const consolidated = existing.find(row => row.quoteId === quoteId && row.kind === "full");
  const plan = consolidated && ["invoice", "deposit_invoice"].includes(quote.kind)
    ? [{ kind: "full" as const, amount: consolidated.amount }]
    : acceptedQuotePaymentPlan(quote);
  const payments: Array<{ id: string; kind: string }> = [];
  const usedPaymentIds = new Set<string>();

  // A final invoice is supporting documentation for the balance already
  // scheduled from the accepted deposit invoice. Even if extraction did not
  // produce a payable amount, still route its file to that existing row.
  if (quote.kind === "final_invoice" && plan.length === 0) {
    const existingFinal = existing.find(
      (row) => row.kind === "final" || row.kind === "full"
    );
    if (existingFinal) {
      usedPaymentIds.add(existingFinal.id);
      payments.push({ id: existingFinal.id, kind: existingFinal.kind });
    }
  }
  for (const planned of plan) {
    let payment = existing.find(
      (row) =>
        row.quoteId === quoteId &&
        row.kind === planned.kind &&
        !usedPaymentIds.has(row.id)
    );

    // A deposit invoice already creates the deterministic final-balance row.
    // When the later final invoice is reviewed, reuse that row instead of
    // creating a second payable for the same stage. Prefer the exact amount,
    // then the untouched generated row, without silently rewriting the schedule.
    if (!payment && quote.kind === "final_invoice" && planned.kind === "final") {
      const candidates = existing.filter(
        (row) =>
          (row.kind === "final" || row.kind === "full") &&
          !usedPaymentIds.has(row.id)
      );
      payment =
        candidates.find(
          (row) =>
            row.currency === quote.currency &&
            Number(row.amount) === Number(planned.amount)
        ) ??
        candidates.find(
          (row) =>
            row.status === "planned" &&
            !row.wireRequestedAt &&
            !row.paidAt &&
            row.quoteId != null
        ) ?? candidates[0];
    }

    if (!payment) {
      const notes =
        planned.kind === "deposit"
          ? "Deposit invoice for print production"
          : planned.kind === "final"
            ? "Final print balance on approved completion"
            : "Print invoice payment";
      const [created] = await db
        .insert(printPayments)
        .values({
          projectId: quote.projectId,
          runId: quote.runId,
          quoteId,
          kind: planned.kind,
          amount: planned.amount,
          currency: quote.currency,
          notes,
        })
        .returning({ id: printPayments.id, kind: printPayments.kind });
      if (created) {
        payment = {
          ...created,
          quoteId,
          status: "planned",
          amount: planned.amount,
          currency: quote.currency,
          wireRequestedAt: null,
          paidAt: null,
        };
      }
    }

    if (payment) {
      usedPaymentIds.add(payment.id);
      payments.push({ id: payment.id, kind: payment.kind });
    }
  }

  const matchingKinds = new Set<string>(invoiceFilePaymentKinds(quote.kind));
  const targets = payments.filter((payment) => matchingKinds.has(payment.kind));
  if (!targets.length) return payments;

  const quoteFiles = await db
    .select({ fileId: fileAttachments.fileId })
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.targetType, "print_quote"),
        eq(fileAttachments.targetId, quoteId)
      )
    );
  if (!quoteFiles.length) return payments;

  const targetIds = targets.map((target) => target.id);
  const existingPaymentFiles = await db
    .select({ fileId: fileAttachments.fileId, targetId: fileAttachments.targetId })
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.targetType, "print_payment"),
        inArray(fileAttachments.targetId, targetIds)
      )
    );
  const existingKeys = new Set(
    existingPaymentFiles.map((row) => `${row.targetId}:${row.fileId}`)
  );
  const links = targets.flatMap((target) =>
    quoteFiles
      .filter((file) => !existingKeys.has(`${target.id}:${file.fileId}`))
      .map((file) => ({
        fileId: file.fileId,
        targetType: "print_payment" as const,
        targetId: target.id,
        label: "invoice",
      }))
  );
  if (links.length) await db.insert(fileAttachments).values(links);
  return payments;
}

/**
 * Reverse the payment side effects of accepting a quote so it can be reopened
 * or rejected. Auto-created payments are linked by `quoteId`; only remove ones
 * still safe to remove (not paid, no wire requested) plus their copied invoice
 * attachments. If a linked payment has been paid or had a wire requested, refuse
 * — real money and history should not disappear silently.
 */
async function reverseAcceptedSideEffects(
  quote: typeof printQuotes.$inferSelect
): Promise<{ error?: string }> {
  const linked = await db
    .select({
      id: printPayments.id,
      paidAt: printPayments.paidAt,
      wireRequestedAt: printPayments.wireRequestedAt,
    })
    .from(printPayments)
    .where(eq(printPayments.quoteId, quote.id));
  const quoteFiles = await db
    .select({ fileId: fileAttachments.fileId })
    .from(fileAttachments)
    .where(
      and(
        eq(fileAttachments.targetType, "print_quote"),
        eq(fileAttachments.targetId, quote.id)
      )
    );
  const supportedKinds = invoiceFilePaymentKinds(quote.kind);
  const stagePayments = supportedKinds.length
    ? await db
        .select({
          id: printPayments.id,
          paidAt: printPayments.paidAt,
          wireRequestedAt: printPayments.wireRequestedAt,
        })
        .from(printPayments)
        .where(
          and(
            eq(printPayments.runId, quote.runId),
            inArray(printPayments.kind, supportedKinds)
          )
        )
    : [];
  const stagePaymentIds = stagePayments.map((payment) => payment.id);
  const copiedFileLinks =
    quoteFiles.length && stagePaymentIds.length
      ? await db
          .select({ targetId: fileAttachments.targetId })
          .from(fileAttachments)
          .where(
            and(
              eq(fileAttachments.targetType, "print_payment"),
              inArray(fileAttachments.targetId, stagePaymentIds),
              inArray(
                fileAttachments.fileId,
                quoteFiles.map((file) => file.fileId)
              )
            )
          )
      : [];
  const copiedTargetIds = new Set(copiedFileLinks.map((link) => link.targetId));
  const associated = [
    ...linked,
    ...stagePayments.filter((payment) => copiedTargetIds.has(payment.id)),
  ].filter(
    (payment, index, rows) =>
      rows.findIndex((candidate) => candidate.id === payment.id) === index
  );
  const locked = associated.filter(
    (payment) => payment.paidAt || payment.wireRequestedAt
  );
  if (locked.length) {
    return {
      error:
        "This quote has a paid or wire-requested payment. Reset or delete that payment before changing the accepted quote.",
    };
  }
  if (copiedTargetIds.size && quoteFiles.length) {
    await db
      .delete(fileAttachments)
      .where(
        and(
          eq(fileAttachments.targetType, "print_payment"),
          inArray(fileAttachments.targetId, [...copiedTargetIds]),
          inArray(
            fileAttachments.fileId,
            quoteFiles.map((file) => file.fileId)
          )
        )
      );
  }
  const removableIds = linked.map((payment) => payment.id);
  if (removableIds.length) {
    await db
      .delete(fileAttachments)
      .where(
        and(
          eq(fileAttachments.targetType, "print_payment"),
          inArray(fileAttachments.targetId, removableIds)
        )
      );
    await db.delete(printPayments).where(inArray(printPayments.id, removableIds));
  }
  return {};
}

/**
 * Reprints carry a run-scoped print/ship budget line seeded from the accepted
 * quote (`syncAcceptedQuoteToRunBudget`). After un-accepting or rejecting, point
 * that line at whatever quote is still accepted for the run, or drop it when
 * none remain. First-print runs use the project-level line kept in sync by
 * `syncPrintEstimateToBudget`, so they need nothing here.
 */
async function reconcileReprintBudgetLine(
  quote: typeof printQuotes.$inferSelect
) {
  const [run] = await db
    .select({ kind: printRuns.kind })
    .from(printRuns)
    .where(eq(printRuns.id, quote.runId))
    .limit(1);
  if (run?.kind !== "reprint") return;
  const acceptedQuotes = await db
    .select()
    .from(printQuotes)
    .where(
      and(
        eq(printQuotes.runId, quote.runId),
        eq(printQuotes.reviewStatus, "accepted")
      )
    );
  const stillAccepted = chooseEstimateQuote(acceptedQuotes, quote.quantityCps);
  if (stillAccepted) {
    await syncAcceptedQuoteToRunBudget(stillAccepted);
  } else {
    await db
      .delete(budgetItems)
      .where(
        and(
          eq(budgetItems.projectId, quote.projectId),
          eq(budgetItems.printRunId, quote.runId),
          eq(budgetItems.category, "print_ship")
        )
      );
    await syncBudgetApprovalState(quote.projectId, quote.runId);
  }
}

/**
 * Pick a review status to return an un-accepted quote to. "suggested" is the
 * natural home, but a partial unique index allows only one suggested quote per
 * run + normalized kind + quantity. If a newer suggestion already occupies that
 * slot, fall back to "active" so the reopen never trips the constraint.
 */
async function reopenTargetStatus(
  quote: typeof printQuotes.$inferSelect
): Promise<"suggested" | "active"> {
  if (quote.quantityCps == null) return "suggested";
  const normalize = (kind: string) =>
    kind === "quote" || kind === "invoice" ? "quote_or_invoice" : kind;
  const target = normalize(quote.kind);
  const candidates = await db
    .select({ id: printQuotes.id, kind: printQuotes.kind })
    .from(printQuotes)
    .where(
      and(
        eq(printQuotes.runId, quote.runId),
        eq(printQuotes.reviewStatus, "suggested"),
        eq(printQuotes.quantityCps, quote.quantityCps)
      )
    );
  const conflict = candidates.some(
    (candidate) =>
      candidate.id !== quote.id && normalize(candidate.kind) === target
  );
  return conflict ? "active" : "suggested";
}

async function restoreAcceptedInvoiceFiles(runId: string) {
  const acceptedInvoices = await db
    .select({ id: printQuotes.id })
    .from(printQuotes)
    .where(
      and(
        eq(printQuotes.runId, runId),
        eq(printQuotes.reviewStatus, "accepted"),
        inArray(printQuotes.kind, ["invoice", "deposit_invoice"])
      )
    );
  for (const invoice of acceptedInvoices) {
    await syncAcceptedInvoiceFiles(invoice.id);
  }
}

export async function reopenPrintQuote(quoteId: string) {
  const { user } = await requireRole("manager");
  const [quote] = await db
    .select()
    .from(printQuotes)
    .where(eq(printQuotes.id, quoteId))
    .limit(1);
  if (!quote) return {};
  if (quote.reviewStatus !== "accepted") return {};
  const reversed = await reverseAcceptedSideEffects(quote);
  if (reversed.error) return reversed;
  const reviewStatus = await reopenTargetStatus(quote);
  await db
    .update(printQuotes)
    .set({ reviewStatus, acceptedAt: null, updatedAt: new Date() })
    .where(eq(printQuotes.id, quoteId));
  if (quote.kind === "final_invoice") {
    await restoreAcceptedInvoiceFiles(quote.runId);
  }
  await syncPrintEstimateToBudget(quote.projectId);
  await reconcileReprintBudgetLine(quote);
  await logActivity({
    actorId: user.id,
    projectId: quote.projectId,
    entityType: "print",
    entityId: quoteId,
    action: "quote",
    summary: "Reopened print quote for review",
  });
  scheduleHealthRecompute(quote.projectId);
  await revalidatePrint(quote.projectId, { budget: true });
  return {};
}

export async function acceptPrintQuote(
  quoteId: string
): Promise<{
  error?: string;
  paymentId?: string;
  attachedToPayment?: boolean;
}> {
  const { user } = await requireRole("manager");
  const [quote] = await db
    .update(printQuotes)
    .set({
      reviewStatus: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(printQuotes.id, quoteId))
    .returning();
  if (!quote) return {};

  // A final invoice does not represent a new quote decision. The accepted
  // deposit invoice already established the order, specs, budget commitment,
  // and remaining-payment row. Reviewing the final invoice should only attach
  // its file to that payable; it must not overwrite the accepted run details.
  const isFinalPaymentDocument = quote.kind === "final_invoice";
  // Acceptance is the explicit review boundary: carry every present production
  // spec onto the run and project defaults. Quote trim is stored in millimetres;
  // run/settings forms use inches, so conversion happens in one shared helper.
  // Missing quote fields never erase existing run values. A manually confirmed
  // quantity also continues to win over the quoted tier.
  const run = await db
    .select()
    .from(printRuns)
    .where(eq(printRuns.id, quote.runId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!isFinalPaymentDocument) {
    const settings = await getOrCreatePrintSettings(quote.projectId);
    const specPatch = quoteRunSpecPatch(quote);
    const contactId =
      quote.contactId ?? run?.contactId ?? settings.defaultContactId ?? null;
    await db.transaction(async (tx) => {
      await tx
        .update(printRuns)
        .set({
          ...specPatch,
          status: "quote_received",
          quantityTarget: run?.quantityTarget ?? quote.quantityCps ?? null,
          contactId,
          updatedAt: new Date(),
        })
        .where(eq(printRuns.id, quote.runId));

      const settingsPatch: Partial<typeof projectPrintSettings.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (specPatch.trimWidthIn)
        settingsPatch.trimWidthIn = specPatch.trimWidthIn;
      if (specPatch.trimHeightIn)
        settingsPatch.trimHeightIn = specPatch.trimHeightIn;
      if (contactId) settingsPatch.defaultContactId = contactId;
      await tx
        .update(projectPrintSettings)
        .set(settingsPatch)
        .where(eq(projectPrintSettings.projectId, quote.projectId));
    });
  }
  const payments = await createPaymentsForQuote(quoteId);
  await syncAcceptedInvoiceFiles(quoteId);
  const actionableKinds = new Set<string>(invoiceFilePaymentKinds(quote.kind));
  for (const payment of payments) {
    if (actionableKinds.has(payment.kind)) {
      await ensurePrintPaymentTask(payment.id, user.id);
    }
  }
  await syncPrintEstimateToBudget(quote.projectId);
  const acceptedRunQuotes = await db
    .select()
    .from(printQuotes)
    .where(
      and(
        eq(printQuotes.runId, quote.runId),
        eq(printQuotes.reviewStatus, "accepted")
      )
    );
  const commitmentQuote =
    chooseEstimateQuote(
      acceptedRunQuotes,
      run?.quantityTarget ?? quote.quantityCps
    ) ?? quote;
  await syncAcceptedQuoteToRunBudget(commitmentQuote);
  const payment = payments.find((candidate) =>
    actionableKinds.has(candidate.kind)
  );
  await logActivity({
    actorId: user.id,
    projectId: quote.projectId,
    entityType: "print",
    entityId: quoteId,
    action: "quote",
    summary: isFinalPaymentDocument
      ? "Attached final invoice to print payment"
      : "Accepted print quote",
  });
  scheduleHealthRecompute(quote.projectId);
  await revalidatePrint(quote.projectId, { budget: true });
  return {
    paymentId: payment?.id,
    attachedToPayment: isFinalPaymentDocument && !!payment,
  };
}

export async function rejectPrintQuote(quoteId: string) {
  const { user } = await requireRole("manager");
  const [quote] = await db
    .select()
    .from(printQuotes)
    .where(eq(printQuotes.id, quoteId))
    .limit(1);
  if (!quote) return {};
  // Rejecting an already-accepted quote must first undo its payments/budget so
  // finance doesn't keep a phantom commitment for a discarded quote.
  const wasAccepted = quote.reviewStatus === "accepted";
  if (wasAccepted) {
    const reversed = await reverseAcceptedSideEffects(quote);
    if (reversed.error) return reversed;
  }
  await db
    .update(printQuotes)
    .set({ reviewStatus: "rejected", acceptedAt: null, updatedAt: new Date() })
    .where(eq(printQuotes.id, quoteId));
  if (wasAccepted && quote.kind === "final_invoice") {
    await restoreAcceptedInvoiceFiles(quote.runId);
  }
  await syncPrintEstimateToBudget(quote.projectId);
  // Only reconcile the run-scoped reprint line when actually reversing an
  // acceptance — rejecting a plain suggestion must not disturb budget lines.
  if (wasAccepted) await reconcileReprintBudgetLine(quote);
  await logActivity({
    actorId: user.id,
    projectId: quote.projectId,
    entityType: "print",
    entityId: quoteId,
    action: "quote",
    summary: "Rejected print quote",
  });
  scheduleHealthRecompute(quote.projectId);
  await revalidatePrint(quote.projectId, { budget: true });
  return {};
}

const paymentSchema = z.object({
  kind: z.enum(["deposit", "final", "full", "custom"]).default("custom"),
  amount: z.coerce.number().min(0.01),
  currency: z.string().min(1).max(8).default("USD"),
  dueDate: z.string().optional(),
  neededByDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export async function addPrintPayment(
  runId: string,
  input: z.input<typeof paymentSchema>
) {
  const { user } = await requireRole("manager");
  const data = paymentSchema.parse(input);
  const [run] = await db.select().from(printRuns).where(eq(printRuns.id, runId)).limit(1);
  if (!run) return { error: "Print run not found." };
  const [payment] = await db
    .insert(printPayments)
    .values({
      projectId: run.projectId,
      runId,
      kind: data.kind,
      amount: data.amount.toFixed(2),
      currency: data.currency,
      dueDate: data.dueDate || null,
      neededByDate: data.neededByDate || null,
      notes: data.notes?.trim() || null,
      createdBy: user.id,
    })
    .returning({ id: printPayments.id });
  await ensurePrintPaymentTask(payment.id, user.id);
  await revalidatePrint(run.projectId);
  return {};
}

/**
 * Mirror actual print spend (sum of paid print payments) into the project's
 * `print_ship` budget line `amountSpent`, lighting up the budget's estimate-vs-
 * actual view. The app does no FX: if any paid payment is in a currency other
 * than the budget line's, we skip the auto-write and leave the manual "Spent"
 * value untouched.
 */
async function syncPrintSpentToBudget(projectId: string, runId?: string | null) {
  const [line] = await db
    .select({ id: budgetItems.id, currency: budgetItems.currency })
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.projectId, projectId),
        eq(budgetItems.category, "print_ship"),
        isNull(budgetItems.printRunId)
      )
    )
    .limit(1);

  if (line) {
    const paid = await db
      .select({ amount: printPayments.amount, currency: printPayments.currency })
      .from(printPayments)
      .where(
        and(
          eq(printPayments.projectId, projectId),
          isNotNull(printPayments.paidAt)
        )
      );

    const lineCurrency = line.currency || "USD";
    if (!paid.some((p) => (p.currency || "USD") !== lineCurrency)) {
      const total = paid.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
      await db
        .update(budgetItems)
        .set({ amountSpent: total.toFixed(2), updatedAt: new Date() })
        .where(eq(budgetItems.id, line.id));
    }
  }

  if (!runId) return;
  const [runLine] = await db
    .select({ id: budgetItems.id, currency: budgetItems.currency })
    .from(budgetItems)
    .where(
      and(
        eq(budgetItems.projectId, projectId),
        eq(budgetItems.printRunId, runId),
        eq(budgetItems.category, "print_ship")
      )
    )
    .limit(1);
  if (!runLine) return;

  const runPaid = await db
    .select({ amount: printPayments.amount, currency: printPayments.currency })
    .from(printPayments)
    .where(and(eq(printPayments.runId, runId), isNotNull(printPayments.paidAt)));
  const runLineCurrency = runLine.currency || "USD";
  if (runPaid.some((p) => (p.currency || "USD") !== runLineCurrency)) return;
  const runTotal = runPaid.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  await db
    .update(budgetItems)
    .set({ amountSpent: runTotal.toFixed(2), updatedAt: new Date() })
    .where(eq(budgetItems.id, runLine.id));
}

export async function markPrintPaymentPaid(paymentId: string) {
  const { user } = await requireRole("manager");
  const [row] = await db
    .update(printPayments)
    .set({ status: "paid", paidAt: new Date(), paidBy: user.id, updatedAt: new Date() })
    .where(eq(printPayments.id, paymentId))
    .returning({
      projectId: printPayments.projectId,
      runId: printPayments.runId,
    });
  if (row) {
    await syncPrintPaymentTaskStatus(paymentId, "paid");
    // Ensure the project-level Print / Ship line exists (e.g. a manual payment
    // with no accepted quote) before mirroring actual spend into it.
    await syncPrintEstimateToBudget(row.projectId);
    await syncPrintSpentToBudget(row.projectId, row.runId);
    scheduleHealthRecompute(row.projectId);
    await revalidatePrint(row.projectId, { budget: true });
  }
  return {};
}

export async function markPrintPaymentUnpaid(paymentId: string) {
  await requireRole("manager");
  const [row] = await db
    .update(printPayments)
    .set({ status: "planned", paidAt: null, paidBy: null, updatedAt: new Date() })
    .where(eq(printPayments.id, paymentId))
    .returning({
      projectId: printPayments.projectId,
      runId: printPayments.runId,
    });
  if (row) {
    await syncPrintPaymentTaskStatus(paymentId, "planned");
    await syncPrintSpentToBudget(row.projectId, row.runId);
    await revalidatePrint(row.projectId, { budget: true });
  }
  return {};
}

export async function deletePrintPayment(paymentId: string) {
  await requireRole("manager");
  const [row] = await db
    .delete(printPayments)
    .where(eq(printPayments.id, paymentId))
    .returning({
      projectId: printPayments.projectId,
      runId: printPayments.runId,
    });
  if (row) {
    await syncPrintSpentToBudget(row.projectId, row.runId);
    await revalidatePrint(row.projectId, { budget: true });
  }
  return {};
}

const emailSchema = z.object({
  reviewedAmount: z.string().optional(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
  ccEmails: z.union([z.string(), z.array(z.string())]).optional(),
});

function emailSendError(error: unknown) {
  const err = error as {
    code?: unknown;
    command?: unknown;
    message?: unknown;
  };
  const code = typeof err.code === "string" ? err.code : "";
  if (code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET") {
    return "Email could not connect to the mail server. Check the SMTP/Gmail settings and try again.";
  }
  if (typeof err.message === "string" && err.message.trim()) {
    return `Email was not sent: ${err.message}`;
  }
  return "Email was not sent. Check the mail settings and try again.";
}

const aiEmailDraftSchema = z.object({
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(20000),
});

const aiEmailDraftJsonSchema = {
  name: "email_draft",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      subject: { type: "string" },
      body: { type: "string" },
    },
    required: ["subject", "body"],
  },
};

const aiEmailLessonsSchema = z.object({ lessons: z.string().max(8000) });

const aiEmailLessonsJsonSchema = {
  name: "email_style_lessons",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      lessons: { type: "string" },
    },
    required: ["lessons"],
  },
};

/** Team-wide learned style for an AI-drafted email type (empty if none yet). */
async function getEmailLessons(operation: string): Promise<string> {
  const [row] = await db
    .select({ lessons: printEmailLessons.lessons })
    .from(printEmailLessons)
    .where(eq(printEmailLessons.operation, operation))
    .limit(1);
  return row?.lessons?.trim() ?? "";
}

export type EmailDraftOperation =
  | "draft_print_rfq"
  | "draft_wire_request"
  | "draft_mou_proposal";

export async function draftWithAi(input: {
  purpose: string;
  fallback: { subject: string; body: string };
  context: Record<string, unknown>;
  actorUserId: string;
  projectId: string;
  operation: EmailDraftOperation;
  entityType: string;
  entityId: string;
  feature?: string;
}) {
  try {
    const [lessons, [actor], workspace] = await Promise.all([
      getEmailLessons(input.operation),
      db.select({ name: user.name }).from(user).where(eq(user.id, input.actorUserId)).limit(1),
      getWorkspaceSettings(),
    ]);
    const senderName = actor?.name?.trim() || "Sastra team";
    const organizationName = workspace.orgName?.trim() || "Sastra workspace";
    let system = buildOperationalDraftSystemPrompt({ senderName, organizationName });
    if (lessons) {
      system += `\n\nLearned preferences from how this team has edited past drafts of this email type — use them to refine the draft, but never let them override the factual, structure, identity, or sign-off requirements above:\n${lessons}`;
    }
    const raw = await aiStructured(
      "email_draft",
      [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: JSON.stringify({
            purpose: input.purpose,
            context: {
              ...input.context,
              senderName,
              organizationName,
            },
          }),
        },
      ],
      aiEmailDraftJsonSchema,
      {
        metering: {
          scope: "workspace",
          feature: input.feature ?? "print",
          operation: input.operation,
          actorUserId: input.actorUserId,
          projectId: input.projectId,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: { purpose: input.purpose },
        },
      }
    );
    return aiEmailDraftSchema.parse(raw);
  } catch {
    return input.fallback;
  }
}

function printRfqPageCountLine(
  run: NonNullable<Awaited<ReturnType<typeof getRunWithProject>>>["run"]
) {
  if (run.quotedTextPages && run.quotedTextPages > 0) {
    return `Final target-language text pages: ${run.quotedTextPages}`;
  }

  return `Estimated target-language text pages: ${run.estimatedTextPages} (estimate for quote request; final page count pending after layout/proof).`;
}

function withPrintRfqPageCountLine(body: string, pageCountLine: string) {
  const existingPageLine =
    /^.*(?:estimated|final|quoted).*?(?:khmer\s+)?(?:text\s+)?pages.*$/im;
  if (existingPageLine.test(body)) {
    return body.replace(existingPageLine, pageCountLine);
  }

  const titleLine = /^Title:.*$/im;
  if (titleLine.test(body)) {
    return body.replace(titleLine, (match) => `${match}\n${pageCountLine}`);
  }

  return `${body.trimEnd()}\n\n${pageCountLine}`;
}

type RunWithProjectContext = NonNullable<
  Awaited<ReturnType<typeof getRunWithProject>>
>;

async function resolvePrinterContact(ctx: RunWithProjectContext) {
  if (ctx.contact?.email) return ctx.contact;
  const settings =
    ctx.settings ?? (await getOrCreatePrintSettings(ctx.run.projectId));
  const defaultContactId = settings.defaultContactId;
  if (!defaultContactId || defaultContactId === ctx.contact?.id) {
    return ctx.contact;
  }
  const [defaultContact] = await db
    .select()
    .from(printContacts)
    .where(eq(printContacts.id, defaultContactId))
    .limit(1);
  return defaultContact ?? ctx.contact;
}

export async function draftPrintRfq(runId: string) {
  const { user } = await requireRole("manager");
  const [ctx, workspace] = await Promise.all([
    getRunWithProject(runId),
    getWorkspaceSettings(),
  ]);
  if (!ctx) return { error: "Print run not found." };
  const { run, projectTitle } = ctx;
  const contact = await resolvePrinterContact(ctx);
  const estimatedTextPages = await refreshRunEstimatedTextPages(run);
  const draftCtx = {
    ...ctx,
    run: { ...run, estimatedTextPages },
  };
  const pageCountLine = printRfqPageCountLine(draftCtx.run);
  const quantities = run.requestedQuantities?.length
    ? run.requestedQuantities
    : [1000, 2000, 3000, 4000, 5000];
  const preferredMeasurementUnit = measurementUnit(ctx.settings?.measurementUnit);
  const trimSize = formatTrimSize(
    run.trimWidthIn,
    run.trimHeightIn,
    preferredMeasurementUnit
  );
  const draft = await draftWithAi({
    purpose: "Request a print quotation from the selected printer contact.",
    fallback: printRfqFallback({
      contactName: contact?.name,
      projectTitle,
      runTitle: run.title,
      pageCountLine,
      trimSize,
      coverPages: run.coverPages,
      quantities,
      textPaper: run.textPaper,
      coverPaper: run.coverPaper,
      binding: run.binding,
      deliveryLocation: run.deliveryLocation,
      notes: run.notes,
      senderName: user.name,
      organizationName: workspace.orgName?.trim() || "Sastra workspace",
    }),
    actorUserId: user.id,
    projectId: run.projectId,
    operation: "draft_print_rfq",
    entityType: "print_run",
    entityId: runId,
    context: {
      recipient: contact
        ? {
            name: contact.name,
            company: contact.company,
            email: contact.email,
          }
        : null,
      projectTitle,
      runTitle: run.title,
      estimatedTextPages,
      quotedTextPages: run.quotedTextPages,
      pageCountLine,
      pageCountStatus:
        run.quotedTextPages && run.quotedTextPages > 0
          ? "Final target-language text page count is available."
          : "Estimated target-language text page count for quote request; final page count is pending after layout/proof.",
      trimSize,
      measurementUnit: preferredMeasurementUnit,
      coverPages: run.coverPages,
      requestedQuantities: quantities,
      textPaper: run.textPaper,
      coverPaper: run.coverPaper,
      binding: run.binding,
      deliveryLocation: run.deliveryLocation,
      notes: run.notes,
      senderName: user.name,
      organizationName: workspace.orgName?.trim() || "Sastra workspace",
      requestedTone:
        "Short, practical, and polite. Present specifications as a readable list and ask for total price and price per copy for every quantity.",
    },
  });
  return {
    ...draft,
    body: withPrintRfqPageCountLine(draft.body, pageCountLine),
    recipientEmail: contact?.email ?? null,
    recipientMissingReason: contact
      ? `Add an email address to ${contact.company || contact.name}.`
      : "Choose a printer contact with an email address.",
  };
}

export async function sendPrintRfq(
  runId: string,
  input: z.input<typeof emailSchema>
) {
  const { user } = await requireRole("manager");
  const data = emailSchema.parse(input);
  const ctx = await getRunWithProject(runId);
  if (!ctx) return { error: "Print run not found." };
  const contact = await resolvePrinterContact(ctx);
  if (!contact?.email) {
    return {
      error: contact
        ? `Add an email address to ${contact.company || contact.name}.`
        : "Choose a printer contact with an email.",
    };
  }
  const settings = ctx.settings ?? (await getOrCreatePrintSettings(ctx.run.projectId));
  const cc =
    data.ccEmails !== undefined
      ? csvEmails(data.ccEmails)
      : settings.ccEmails?.length
        ? settings.ccEmails
        : [...DEFAULT_PRINT_CC_EMAILS];
  const invalid = invalidEmails(cc);
  if (invalid.length) return { error: `Check CC email: ${invalid[0]}` };
  let res;
  try {
    res = await sendEmail({
      to: [contact.email],
      cc,
      subject: data.subject,
      bodyText: data.body,
      actingUserId: user.id,
    });
  } catch (error) {
    return { error: emailSendError(error) };
  }
  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.gmailThreadId, res.threadKey))
    .limit(1);
  if (thread) {
    await linkPrintThread({
      threadId: thread.id,
      participantEmails: [contact.email, ...cc],
      subject: data.subject,
      bodyText: data.body,
      existingProjectId: ctx.run.projectId,
      runId,
    });
  }
  await db
    .update(printRuns)
    .set({
      contactId: contact.id,
      status: "quote_requested",
      updatedAt: new Date(),
    })
    .where(eq(printRuns.id, runId));
  await logActivity({
    actorId: user.id,
    projectId: ctx.run.projectId,
    entityType: "print",
    entityId: runId,
    action: "email",
    summary: `Sent print RFQ to ${contact.email}`,
  });
  await removeEmailDraftForUser(user.id, "print_rfq", runId);
  await revalidatePrint(ctx.run.projectId);
  return {};
}

async function paymentContext(paymentId: string) {
  const [row] = await db
    .select({
      payment: printPayments,
      run: printRuns,
      projectTitle: projects.title,
      projectSlug: projects.slug,
      settings: projectPrintSettings,
      contact: printContacts,
    })
    .from(printPayments)
    .innerJoin(printRuns, eq(printRuns.id, printPayments.runId))
    .innerJoin(projects, eq(projects.id, printPayments.projectId))
    .leftJoin(projectPrintSettings, eq(projectPrintSettings.projectId, printPayments.projectId))
    .leftJoin(printContacts, eq(printContacts.id, printRuns.contactId))
    .where(eq(printPayments.id, paymentId))
    .limit(1);
  return row ?? null;
}

export async function reviewPrintWirePayment(paymentId: string) {
  await requireRole("manager");
  const ctx = await paymentContext(paymentId);
  if (!ctx) return { error: "Payment not found." };
  const [payments, quotes] = await Promise.all([
    db.select().from(printPayments).where(eq(printPayments.runId, ctx.payment.runId)),
    db.select().from(printQuotes).where(eq(printQuotes.runId, ctx.payment.runId)),
  ]);
  return reviewWirePayment(ctx.payment, payments, quotes);
}

/** Explicitly replace an untouched staged schedule with the reviewed invoice total. */
export async function consolidatePrintInvoicePayment(paymentId: string, invoiceId: string, reviewedAmount: string, reviewedCurrency: string) {
  const { user } = await requireRole("manager");
  const ctx = await paymentContext(paymentId);
  if (!ctx) return { error: "Payment not found." };
  const result = await db.transaction(async tx => {
    await tx.select().from(printRuns).where(eq(printRuns.id, ctx.payment.runId)).for("update");
    const payments = await tx.select().from(printPayments).where(eq(printPayments.runId, ctx.payment.runId)).for("update");
    const quotes = await tx.select().from(printQuotes).where(eq(printQuotes.runId, ctx.payment.runId)).for("update");
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return { error: "Payment changed. Refresh and review again." };
    const review = reviewWirePayment(payment, payments, quotes);
    if (!review.correction || review.correction.invoiceId !== invoiceId || review.correction.amount !== reviewedAmount || review.correction.currency !== reviewedCurrency) return { error: review.error || "Schedule changed. Refresh and review again." };
    const removed = payments.filter(p => p.id !== paymentId).map(p => p.id);
    await tx.delete(emailDrafts).where(and(eq(emailDrafts.kind, "print_wire"), inArray(emailDrafts.contextId, payments.map(p => p.id))));
    const removedTasks = removed.length ? await tx.select({ id: tasks.id }).from(tasks).where(inArray(tasks.printPaymentId, removed)) : [];
    if (removed.length) {
      await tx.delete(tasks).where(inArray(tasks.printPaymentId, removed));
      await tx.delete(fileAttachments).where(and(eq(fileAttachments.targetType, "print_payment"), inArray(fileAttachments.targetId, removed)));
      await tx.delete(printPayments).where(inArray(printPayments.id, removed));
    }
    await tx.update(printPayments).set({ quoteId: invoiceId, amount: review.correction.amount, currency: review.correction.currency,
      notes: "Full invoice payment (replaces staged schedule)" }).where(eq(printPayments.id, paymentId));
    const taskCopy = { kind: "full", amount: review.correction.amount, currency: review.correction.currency,
      runTitle: ctx.run.title, invoiceNumber: quotes.find(quote => quote.id === invoiceId)?.invoiceNumber };
    await tx.update(tasks).set({ title: printerPaymentTaskTitle(taskCopy), description: printerPaymentTaskDescription(taskCopy) })
      .where(eq(tasks.printPaymentId, paymentId));
    await tx.delete(fileAttachments).where(and(eq(fileAttachments.targetType, "print_payment"), eq(fileAttachments.targetId, paymentId)));
    const links = await tx.select().from(fileAttachments).where(and(eq(fileAttachments.targetType, "print_quote"), eq(fileAttachments.targetId, invoiceId)));
    if (links.length) await tx.insert(fileAttachments).values(links.map(link => ({ fileId: link.fileId, targetType: "print_payment" as const, targetId: paymentId, label: "invoice" })));
    return { amount: review.correction.amount, removed, removedTaskIds: removedTasks.map(task => task.id), quote: quotes.find(quote => quote.id === invoiceId)! };
  });
  if ("error" in result) return result;
  await clearOverdueNotificationsForTasks(result.removedTaskIds);
  await logActivity({ actorId: user.id, projectId: ctx.payment.projectId, entityType: "print", entityId: paymentId,
    action: "payment", summary: `Consolidated planned payments into full invoice payment ${result.amount}`, data: { invoiceId, replacedPaymentIds: result.removed } });
  await ensurePrintPaymentTask(paymentId, user.id);
  await syncPrintEstimateToBudget(ctx.payment.projectId);
  await syncAcceptedQuoteToRunBudget(result.quote);
  await revalidatePrint(ctx.payment.projectId, { budget: true });
  return {};
}

export async function draftWireRequest(paymentId: string) {
  const { user } = await requireRole("manager");
  const review = await reviewPrintWirePayment(paymentId);
  if (review.error) return review;
  const [ctx, workspace, attachedInvoices] = await Promise.all([
    paymentContext(paymentId),
    getWorkspaceSettings(),
    invoiceAttachmentRows(paymentId),
  ]);
  if (!ctx) return { error: "Payment not found." };
  if (attachedInvoices.length === 0) {
    return {
      error:
        "Upload a PDF invoice to this payment before drafting the wire request.",
    };
  }
  const amount = moneyLabel(ctx.payment.amount, ctx.payment.currency);
  const organizationName = workspace.orgName?.trim() || "Sastra workspace";
  return await draftWithAi({
    purpose:
      "Request that the finance office pay a printer invoice by wire transfer.",
    fallback: wireRequestFallback({
      amount,
      projectTitle: ctx.projectTitle,
      payee: ctx.contact?.company || ctx.contact?.name || "the printer",
      paymentStage: ctx.payment.kind.replace(/_/g, " "),
      purpose: `${ctx.run.title} print run`,
      neededBy: ctx.payment.neededByDate
        ? formatDate(ctx.payment.neededByDate)
        : null,
      confirmationRecipient: ctx.contact?.email || "the printer",
      senderName: user.name,
      organizationName,
    }),
    actorUserId: user.id,
    projectId: ctx.payment.projectId,
    operation: "draft_wire_request",
    entityType: "print_payment",
    entityId: paymentId,
    context: {
      recipientEmail: ctx.settings?.financialEmail || DEFAULT_FINANCIAL_EMAIL,
      defaultCcEmails: ctx.settings?.ccEmails?.length
        ? ctx.settings.ccEmails
        : DEFAULT_PRINT_CC_EMAILS,
      fund: workspace.fundingAccountLabel || "publishing fund",
      projectTitle: ctx.projectTitle,
      runTitle: ctx.run.title,
      paymentKind: ctx.payment.kind,
      amount,
      dueDate: ctx.payment.dueDate,
      neededByDate: ctx.payment.neededByDate,
      notes: ctx.payment.notes,
      printer: ctx.contact
        ? {
            name: ctx.contact.name,
            company: ctx.contact.company,
            email: ctx.contact.email,
          }
        : null,
      hasAttachedInvoice: true,
      senderName: user.name,
      organizationName,
      requestedTone:
        "Short and firm. Lead with payee, payment stage, amount, and purpose. State that the invoice is attached, include the needed-by date only when known, and identify who should receive confirmation.",
    },
  });
}

async function invoiceAttachments(paymentId: string) {
  const pdfs = await invoiceAttachmentRows(paymentId);
  const attachments = [];
  for (const file of pdfs) {
    attachments.push({
      filename: file.originalName,
      content: await getObjectBuffer(file.r2Key),
      contentType: file.mimeType,
    });
  }
  return attachments;
}

async function invoiceAttachmentRows(paymentId: string) {
  const rows = await db
    .select({
      r2Key: files.r2Key,
      originalName: files.originalName,
      mimeType: files.mimeType,
    })
    .from(fileAttachments)
    .innerJoin(files, eq(files.id, fileAttachments.fileId))
    .where(
      and(
        eq(fileAttachments.targetType, "print_payment"),
        eq(fileAttachments.targetId, paymentId),
        eq(files.status, "ready")
      )
    )
    .orderBy(desc(fileAttachments.createdAt));
  return rows
    .filter((row) => row.mimeType === "application/pdf")
    .slice(0, 5);
}

export async function sendWireRequest(
  paymentId: string,
  input: z.input<typeof emailSchema>
) {
  const { user } = await requireRole("manager");
  const data = emailSchema.parse(input);
  const review = await reviewPrintWirePayment(paymentId);
  if (review.error) return { error: review.error };
  const ctx = await paymentContext(paymentId);
  if (!ctx) return { error: "Payment not found." };
  if (Number(data.reviewedAmount) !== Number(ctx.payment.amount)) return { error: "The payment amount changed. Close this draft and open Wire email again to review the current amount." };
  const settings = ctx.settings ?? (await getOrCreatePrintSettings(ctx.payment.projectId));
  const to = settings.financialEmail || DEFAULT_FINANCIAL_EMAIL;
  const cc =
    data.ccEmails !== undefined
      ? csvEmails(data.ccEmails)
      : settings.ccEmails?.length
        ? settings.ccEmails
        : [...DEFAULT_PRINT_CC_EMAILS];
  const invalid = invalidEmails(cc);
  if (invalid.length) return { error: `Check CC email: ${invalid[0]}` };
  const attachments = await invoiceAttachments(paymentId);
  if (attachments.length === 0) {
    return {
      error:
        "Upload a PDF invoice to this payment before sending the wire request.",
    };
  }
  // Claim the exact reviewed amount before external delivery. Consolidation
  // locks this row too, so it cannot rewrite a payment during a send.
  const [claimed] = await db.update(printPayments).set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(printPayments.id, paymentId), eq(printPayments.status, "planned"),
      eq(printPayments.amount, ctx.payment.amount), isNull(printPayments.paidAt), isNull(printPayments.wireRequestedAt)))
    .returning({ id: printPayments.id });
  if (!claimed) return { error: "Payment changed or a wire request is already in progress. Refresh and check correspondence before retrying." };
  let res;
  try {
    res = await sendEmail({
      to: [to],
      cc,
      subject: data.subject,
      bodyText: data.body,
      attachments,
      actingUserId: user.id,
    });
  } catch {
    return { error: "Wire delivery could not be confirmed. Check correspondence before retrying." };
  }
  const [thread] = await db
    .select({ id: emailThreads.id })
    .from(emailThreads)
    .where(eq(emailThreads.gmailThreadId, res.threadKey))
    .limit(1);
  if (thread) {
    await db
      .update(emailThreads)
      .set({
        projectId: ctx.payment.projectId,
        linkedManually: true,
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, thread.id));
    await linkPrintThread({
      threadId: thread.id,
      participantEmails: [to, ...cc],
      subject: data.subject,
      bodyText: data.body,
      existingProjectId: ctx.payment.projectId,
      runId: ctx.payment.runId,
    });
  }
  await db
    .update(printPayments)
    .set({
      status: "requested",
      wireRequestedAt: new Date(),
      wireEmailThreadId: thread?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(printPayments.id, paymentId));
  await syncPrintPaymentTaskStatus(paymentId, "requested");
  // Requesting a deposit/final wire means the run is now waiting on money.
  await advancePrintRunStatus(ctx.payment.runId, "awaiting_payment");
  await logActivity({
    actorId: user.id,
    projectId: ctx.payment.projectId,
    entityType: "print",
    entityId: paymentId,
    action: "wire_request",
    summary: `Requested wire for ${moneyLabel(ctx.payment.amount, ctx.payment.currency)}`,
  });
  await removeEmailDraftForUser(user.id, "print_wire", paymentId);
  await revalidatePrint(ctx.payment.projectId);
  return {};
}

const learnEmailSchema = z.object({
  operation: z.enum([
    "draft_print_rfq",
    "draft_wire_request",
    "draft_mou_proposal",
  ]),
  projectId: z.string().uuid(),
  baselineSubject: z.string().max(2000).default(""),
  baselineBody: z.string().max(20000).default(""),
  finalSubject: z.string().max(2000).default(""),
  finalBody: z.string().max(20000).default(""),
});

/**
 * Learn from a manager's edits: compare the AI's draft with the version actually
 * sent and fold the durable style differences into the team-wide style guide for
 * that email type, which `draftWithAi` injects into future drafts. Best-effort
 * and fire-and-forget from the client — it never blocks or fails a send.
 */
export async function learnFromEmailEdit(
  input: z.input<typeof learnEmailSchema>
) {
  const { user } = await requireRole("manager");
  const data = learnEmailSchema.parse(input);
  const draft = `Subject: ${data.baselineSubject}\n\n${data.baselineBody}`.trim();
  const sent = `Subject: ${data.finalSubject}\n\n${data.finalBody}`.trim();
  // Nothing to compare, or the manager sent it unchanged — nothing to learn.
  if (!draft || !sent || draft === sent) return {};
  try {
    const existing = await getEmailLessons(data.operation);
    const purpose =
      data.operation === "draft_print_rfq"
        ? "requesting a print quotation from a printer"
        : data.operation === "draft_mou_proposal"
          ? "proposing a funding partnership / MoU to a sponsor with the budget quotation attached"
          : "requesting the finance office pay a printer invoice by wire transfer";
    const raw = await aiStructured(
      "email_draft",
      [
        {
          role: "system",
          content: [
            "You maintain a short style guide for how a translation-publishing team writes one specific kind of operational email.",
            "Compare the AI draft with the human-edited version that was actually sent, and update the guide with only DURABLE, GENERALIZABLE preferences: tone, greeting, sign-off, structure, ordering, phrasing, and what to include or omit.",
            "Never record one-off facts (specific amounts, dates, names, project titles, account numbers) — capture the underlying pattern, not the value.",
            "Merge with the existing guide: keep what still holds, drop anything the new edit contradicts, and never let it grow unbounded.",
            "Output a concise bullet list, at most 10 short bullets and under 1000 characters.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            emailType: data.operation,
            purpose,
            existingStyleGuide: existing || "(none yet)",
            aiDraft: draft,
            humanEditedFinal: sent,
          }),
        },
      ],
      aiEmailLessonsJsonSchema,
      {
        metering: {
          scope: "workspace",
          feature: "print",
          operation: "learn_email_style",
          actorUserId: user.id,
          projectId: data.projectId,
          entityType: "print_email_lessons",
          entityId: data.operation,
        },
      }
    );
    const lessons = aiEmailLessonsSchema.parse(raw).lessons.trim().slice(0, 6000);
    if (!lessons) return {};
    await db
      .insert(printEmailLessons)
      .values({
        operation: data.operation,
        lessons,
        sampleCount: 1,
        lastActorId: user.id,
      })
      .onConflictDoUpdate({
        target: printEmailLessons.operation,
        set: {
          lessons,
          sampleCount: sql`${printEmailLessons.sampleCount} + 1`,
          lastActorId: user.id,
          updatedAt: new Date(),
        },
      });
  } catch {
    // Best-effort; learning must never surface an error to the sender.
  }
  return {};
}
