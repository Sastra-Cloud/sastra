import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";

import { db } from "@/lib/db";
import { expectedNetCents } from "@/lib/budget/compute";
import {
  budgetItems,
  budgetScopePresentations,
  emailMessages,
  emailThreads,
  fileAttachments,
  files,
  fundingReceipts,
  mouPayments,
  printContacts,
  printExtractionJobs,
  printPayments,
  printQuotes,
  printRuns,
  printThreadLinks,
  projectBudgetSettings,
  projectPrintSettings,
  projects,
  tasks,
  user,
} from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

export type PrintContact = typeof printContacts.$inferSelect;
export type ProjectPrintSettings = typeof projectPrintSettings.$inferSelect;
export type PrintRun = typeof printRuns.$inferSelect;
export type PrintQuote = typeof printQuotes.$inferSelect;
export type PrintPayment = typeof printPayments.$inferSelect;
export type PrintPaymentRow = PrintPayment & {
  taskId: string | null;
  taskStatus: string | null;
  taskAssigneeName: string | null;
};

export type PrintRunRow = PrintRun & {
  contactName: string | null;
  contactCompany: string | null;
  contactEmail: string | null;
};

export type PrintThreadRow = {
  id: string;
  threadId: string;
  subject: string | null;
  status: string;
  lastMessageAt: Date | null;
  lastDirection: "inbound" | "outbound" | null;
  contactName: string | null;
  latestProofUrl: string | null;
};

export type PrintProofRow = {
  attachmentId: string;
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  receivedAt: Date | null;
  threadId: string;
  runId: string | null;
  runTitle: string | null;
};

export type BudgetPageBasis = {
  wordCount: number;
  wordsPerPage: number;
  sourcePageCount: number | null;
};

/** Per-project print settings, created with defaults on first access. */
export async function getOrCreatePrintSettings(
  projectId: string
): Promise<ProjectPrintSettings> {
  const [existing] = await db
    .select()
    .from(projectPrintSettings)
    .where(eq(projectPrintSettings.projectId, projectId))
    .limit(1);
  if (existing) return existing;

  const workspace = await getWorkspaceSettings();
  await db
    .insert(projectPrintSettings)
    .values({
      projectId,
      trimWidthIn: workspace.trimWidthIn,
      trimHeightIn: workspace.trimHeightIn,
      languageExpansionFactor: workspace.languageExpansionFactor,
      financialEmail: workspace.financialEmail ?? "",
      ccEmails: workspace.defaultCcEmails,
    })
    .onConflictDoNothing({ target: projectPrintSettings.projectId });

  const [row] = await db
    .select()
    .from(projectPrintSettings)
    .where(eq(projectPrintSettings.projectId, projectId))
    .limit(1);
  return row;
}

export async function listPrintContacts(opts: { activeOnly?: boolean } = {}) {
  return db
    .select()
    .from(printContacts)
    .where(opts.activeOnly ? eq(printContacts.isActive, true) : undefined)
    .orderBy(asc(printContacts.company), asc(printContacts.name));
}

export async function listPrintRuns(projectId: string): Promise<PrintRunRow[]> {
  return db
    .select({
      id: printRuns.id,
      projectId: printRuns.projectId,
      contactId: printRuns.contactId,
      sourceRunId: printRuns.sourceRunId,
      title: printRuns.title,
      kind: printRuns.kind,
      printNumber: printRuns.printNumber,
      status: printRuns.status,
      campaignStartDate: printRuns.campaignStartDate,
      campaignDueDate: printRuns.campaignDueDate,
      fundingGoal: printRuns.fundingGoal,
      fundingCurrency: printRuns.fundingCurrency,
      reprintReason: printRuns.reprintReason,
      quantityTarget: printRuns.quantityTarget,
      requestedQuantities: printRuns.requestedQuantities,
      trimWidthIn: printRuns.trimWidthIn,
      trimHeightIn: printRuns.trimHeightIn,
      languageExpansionFactor: printRuns.languageExpansionFactor,
      estimatedTextPages: printRuns.estimatedTextPages,
      quotedTextPages: printRuns.quotedTextPages,
      coverPages: printRuns.coverPages,
      textPaper: printRuns.textPaper,
      coverPaper: printRuns.coverPaper,
      binding: printRuns.binding,
      deliveryLocation: printRuns.deliveryLocation,
      latestProofUrl: printRuns.latestProofUrl,
      notes: printRuns.notes,
      createdBy: printRuns.createdBy,
      createdAt: printRuns.createdAt,
      updatedAt: printRuns.updatedAt,
      contactName: printContacts.name,
      contactCompany: printContacts.company,
      contactEmail: printContacts.email,
    })
    .from(printRuns)
    .leftJoin(printContacts, eq(printContacts.id, printRuns.contactId))
    .where(eq(printRuns.projectId, projectId))
    .orderBy(desc(printRuns.createdAt));
}

export async function listPrintQuotes(projectId: string): Promise<PrintQuote[]> {
  return db
    .select()
    .from(printQuotes)
    .where(eq(printQuotes.projectId, projectId))
    .orderBy(desc(printQuotes.createdAt));
}

export async function listPrintPayments(
  projectId: string
): Promise<PrintPaymentRow[]> {
  return db
    .select({
      ...getTableColumns(printPayments),
      taskId: tasks.id,
      taskStatus: tasks.status,
      taskAssigneeName: user.name,
    })
    .from(printPayments)
    .leftJoin(tasks, eq(tasks.printPaymentId, printPayments.id))
    .leftJoin(user, eq(user.id, tasks.assignedTo))
    .where(eq(printPayments.projectId, projectId))
    .orderBy(asc(printPayments.dueDate), asc(printPayments.createdAt));
}

export async function listPrintThreads(
  projectId: string
): Promise<PrintThreadRow[]> {
  return db
    .select({
      id: printThreadLinks.id,
      threadId: emailThreads.id,
      subject: emailThreads.subject,
      status: emailThreads.status,
      lastMessageAt: emailThreads.lastMessageAt,
      lastDirection: emailThreads.lastDirection,
      contactName: printContacts.name,
      latestProofUrl: printThreadLinks.latestProofUrl,
    })
    .from(printThreadLinks)
    .innerJoin(emailThreads, eq(emailThreads.id, printThreadLinks.threadId))
    .leftJoin(printContacts, eq(printContacts.id, printThreadLinks.contactId))
    .where(eq(printThreadLinks.projectId, projectId))
    .orderBy(desc(emailThreads.lastMessageAt));
}

/** R2-backed proof PDFs received on printer correspondence for this project. */
export async function listPrintProofs(
  projectId: string
): Promise<PrintProofRow[]> {
  return db
    .select({
      attachmentId: fileAttachments.id,
      fileId: files.id,
      originalName: files.originalName,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      receivedAt: emailMessages.sentAt,
      threadId: emailMessages.threadId,
      runId: printThreadLinks.runId,
      runTitle: printRuns.title,
    })
    .from(fileAttachments)
    .innerJoin(files, eq(files.id, fileAttachments.fileId))
    .innerJoin(
      emailMessages,
      and(
        eq(fileAttachments.targetType, "email_message"),
        eq(fileAttachments.targetId, emailMessages.id)
      )
    )
    .innerJoin(
      printThreadLinks,
      eq(printThreadLinks.threadId, emailMessages.threadId)
    )
    .leftJoin(printRuns, eq(printRuns.id, printThreadLinks.runId))
    .where(
      and(
        eq(printThreadLinks.projectId, projectId),
        eq(fileAttachments.label, "print_proof"),
        eq(files.status, "ready")
      )
    )
    .orderBy(desc(emailMessages.sentAt), desc(fileAttachments.createdAt));
}

export type ExtractionIssue = {
  id: string;
  kind: string;
  runId: string | null;
  runTitle: string | null;
  fileName: string | null;
  threadSubject: string | null;
  error: string | null;
  attempts: number;
  updatedAt: Date;
};

/** Failed extraction jobs for a project, most recent first (for the retry UI). */
export async function listExtractionIssues(
  projectId: string
): Promise<ExtractionIssue[]> {
  const rows = await db
    .select({
      id: printExtractionJobs.id,
      kind: printExtractionJobs.kind,
      runId: printExtractionJobs.runId,
      runTitle: printRuns.title,
      fileName: files.originalName,
      threadSubject: emailThreads.subject,
      error: printExtractionJobs.error,
      attempts: printExtractionJobs.attempts,
      updatedAt: printExtractionJobs.updatedAt,
    })
    .from(printExtractionJobs)
    .leftJoin(printRuns, eq(printRuns.id, printExtractionJobs.runId))
    .leftJoin(files, eq(files.id, printExtractionJobs.fileId))
    .leftJoin(emailThreads, eq(emailThreads.id, printExtractionJobs.sourceThreadId))
    .where(
      and(
        eq(printExtractionJobs.projectId, projectId),
        eq(printExtractionJobs.status, "failed")
      )
    )
    .orderBy(desc(printExtractionJobs.updatedAt))
    .limit(25);
  return rows;
}

export async function getBudgetPageBasis(
  projectId: string
): Promise<BudgetPageBasis> {
  const [budgetSettings] = await db
    .select({
      wordCount: projectBudgetSettings.wordCount,
      sourcePageCount: projectBudgetSettings.sourcePageCount,
      wordsPerPage: projectBudgetSettings.wordsPerPage,
    })
    .from(projectBudgetSettings)
    .where(eq(projectBudgetSettings.projectId, projectId))
    .limit(1);

  const sourcePages = Math.max(
    0,
    Math.round(Number(budgetSettings?.sourcePageCount ?? 0))
  );
  return {
    wordCount: budgetSettings?.wordCount ?? 0,
    wordsPerPage: budgetSettings?.wordsPerPage ?? 217,
    sourcePageCount: sourcePages > 0 ? sourcePages : null,
  };
}

export type PrintBudgetLine = {
  amount: string;
  amountSecured: string;
  amountSpent: string;
  currency: string;
};

export type RunFinanceSummary = {
  runId: string;
  budgeted: number;
  lineRaised: number;
  scheduled: number;
  received: number;
  available: number;
  spent: number;
  currency: string;
};

export async function listRunFinanceSummaries(
  projectId: string
): Promise<RunFinanceSummary[]> {
  const [budgetRows, receiptRows, mouRows, paidRows, presentationRows] =
    await Promise.all([
    db
      .select({
        runId: budgetItems.printRunId,
        budgeted: sql<number>`coalesce(sum(${budgetItems.amount}), 0)::float8`,
        raised: sql<number>`coalesce(sum(${budgetItems.amountSecured}), 0)::float8`,
        currency: sql<string>`coalesce(max(${budgetItems.currency}), 'USD')`,
      })
      .from(budgetItems)
      .where(
        and(
          eq(budgetItems.projectId, projectId),
          isNotNull(budgetItems.printRunId)
        )
      )
      .groupBy(budgetItems.printRunId),
    db
      .select({
        runId: fundingReceipts.printRunId,
        received: sql<number>`coalesce(sum(${fundingReceipts.amount}), 0)::float8`,
        available: sql<number>`coalesce(sum(coalesce(${fundingReceipts.actualNetAmount}, ${fundingReceipts.expectedNetAmount}, ${fundingReceipts.amount})), 0)::float8`,
        currency: sql<string>`coalesce(max(${fundingReceipts.currency}), 'USD')`,
      })
      .from(fundingReceipts)
      .where(
        and(
          eq(fundingReceipts.projectId, projectId),
          isNotNull(fundingReceipts.printRunId)
        )
      )
      .groupBy(fundingReceipts.printRunId),
    db
      .select({
        runId: mouPayments.printRunId,
        scheduled: sql<number>`coalesce(sum(${mouPayments.amount}) filter (where ${mouPayments.paidAt} is null), 0)::float8`,
        currency: sql<string>`coalesce(max(${mouPayments.currency}), 'USD')`,
      })
      .from(mouPayments)
      .where(
        and(eq(mouPayments.projectId, projectId), isNotNull(mouPayments.printRunId))
      )
      .groupBy(mouPayments.printRunId),
    db
      .select({
        runId: printPayments.runId,
        spent: sql<number>`coalesce(sum(${printPayments.amount}), 0)::float8`,
        currency: sql<string>`coalesce(max(${printPayments.currency}), 'USD')`,
      })
      .from(printPayments)
      .where(and(eq(printPayments.projectId, projectId), isNotNull(printPayments.paidAt)))
      .groupBy(printPayments.runId),
    db
      .select({
        runId: budgetScopePresentations.printRunId,
        deductionBps: budgetScopePresentations.deductionBps,
      })
      .from(budgetScopePresentations)
      .where(
        and(
          eq(budgetScopePresentations.projectId, projectId),
          isNotNull(budgetScopePresentations.printRunId)
        )
      ),
    ]);

  const deductionByRun = new Map(
    presentationRows.flatMap((row) =>
      row.runId ? [[row.runId, row.deductionBps] as const] : []
    )
  );

  const summaries = new Map<string, RunFinanceSummary>();
  const ensure = (runId: string, currency = "USD") => {
    const existing = summaries.get(runId);
    if (existing) return existing;
    const created = {
      runId,
      budgeted: 0,
      lineRaised: 0,
      scheduled: 0,
      received: 0,
      available: 0,
      spent: 0,
      currency,
    };
    summaries.set(runId, created);
    return created;
  };

  for (const row of budgetRows) {
    if (!row.runId) continue;
    const summary = ensure(row.runId, row.currency);
    summary.budgeted = row.budgeted;
    summary.lineRaised = row.raised;
    summary.currency = row.currency;
  }
  for (const row of receiptRows) {
    if (!row.runId) continue;
    const summary = ensure(row.runId, row.currency);
    summary.received = row.received;
    summary.available = row.available;
    summary.currency ||= row.currency;
  }
  for (const row of mouRows) {
    if (!row.runId) continue;
    const summary = ensure(row.runId, row.currency);
    summary.scheduled = row.scheduled;
    summary.currency ||= row.currency;
  }
  // Older run receipts may not have stored expected-net values yet. Preserve
  // their gross "received" total, but derive a truthful operational estimate
  // from the run's snapshotted deduction until a manager records the actual net.
  for (const summary of summaries.values()) {
    if (summary.received > 0 && summary.available === summary.received) {
      const bps = deductionByRun.get(summary.runId) ?? 0;
      summary.available =
        expectedNetCents(Math.round(summary.received * 100), bps) / 100;
    }
  }
  for (const row of paidRows) {
    const summary = ensure(row.runId, row.currency);
    summary.spent = row.spent;
    summary.currency ||= row.currency;
  }
  return [...summaries.values()];
}

/** The project's `print_ship` budget line (estimate/raised/spent) + MoU flag. */
export async function getPrintBudgetSummary(projectId: string): Promise<{
  printBudget: PrintBudgetLine | null;
  mouRequired: boolean;
}> {
  const [[printLine], [project]] = await Promise.all([
    db
      .select({
        amount: budgetItems.amount,
        amountSecured: budgetItems.amountSecured,
        amountSpent: budgetItems.amountSpent,
        currency: budgetItems.currency,
      })
      .from(budgetItems)
      .where(
        and(
          eq(budgetItems.projectId, projectId),
          eq(budgetItems.category, "print_ship"),
          isNull(budgetItems.printRunId)
        )
      )
      .limit(1),
    db
      .select({ mouRequired: projects.mouRequired })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  ]);
  return {
    printBudget: printLine ?? null,
    mouRequired: project?.mouRequired ?? false,
  };
}

export async function getPrintData(projectId: string) {
  const settings = await getOrCreatePrintSettings(projectId);
  const basis = await getBudgetPageBasis(projectId);

  const [
    contacts,
    runs,
    quotes,
    payments,
    threads,
    proofs,
    budgetSummary,
    extractionIssues,
    runFinance,
  ] =
    await Promise.all([
      listPrintContacts({ activeOnly: true }),
      listPrintRuns(projectId),
      listPrintQuotes(projectId),
      listPrintPayments(projectId),
      listPrintThreads(projectId),
      listPrintProofs(projectId),
      getPrintBudgetSummary(projectId),
      listExtractionIssues(projectId),
      listRunFinanceSummaries(projectId),
    ]);

  return {
    settings,
    wordCount: basis.wordCount,
    wordsPerPage: basis.wordsPerPage,
    sourcePageCount: basis.sourcePageCount,
    contacts,
    runs,
    quotes,
    payments,
    threads,
    proofs,
    extractionIssues,
    runFinance,
    printBudget: budgetSummary.printBudget,
    mouRequired: budgetSummary.mouRequired,
  };
}

export async function getRunWithProject(runId: string) {
  const [row] = await db
    .select({
      run: printRuns,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      settings: projectPrintSettings,
      contact: printContacts,
    })
    .from(printRuns)
    .innerJoin(projects, eq(projects.id, printRuns.projectId))
    .leftJoin(projectPrintSettings, eq(projectPrintSettings.projectId, printRuns.projectId))
    .leftJoin(printContacts, eq(printContacts.id, printRuns.contactId))
    .where(eq(printRuns.id, runId))
    .limit(1);
  return row ?? null;
}

export async function listQuotesForRuns(runIds: string[]) {
  if (!runIds.length) return new Map<string, PrintQuote[]>();
  const rows = await db
    .select()
    .from(printQuotes)
    .where(inArray(printQuotes.runId, runIds))
    .orderBy(desc(printQuotes.createdAt));
  const map = new Map<string, PrintQuote[]>();
  for (const row of rows) {
    const list = map.get(row.runId) ?? [];
    list.push(row);
    map.set(row.runId, list);
  }
  return map;
}

export async function listPaymentsForRuns(runIds: string[]) {
  if (!runIds.length) return new Map<string, PrintPayment[]>();
  const rows = await db
    .select()
    .from(printPayments)
    .where(inArray(printPayments.runId, runIds))
    .orderBy(asc(printPayments.dueDate), asc(printPayments.createdAt));
  const map = new Map<string, PrintPayment[]>();
  for (const row of rows) {
    const list = map.get(row.runId) ?? [];
    list.push(row);
    map.set(row.runId, list);
  }
  return map;
}

export async function latestActiveRun(projectId: string): Promise<PrintRun | null> {
  const [row] = await db
    .select()
    .from(printRuns)
    .where(
      and(eq(printRuns.projectId, projectId), eq(printRuns.status, "active"))
    )
    .orderBy(desc(printRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getActiveReprintRun(projectId: string): Promise<PrintRun | null> {
  const [row] = await db
    .select()
    .from(printRuns)
    .where(
      and(
        eq(printRuns.projectId, projectId),
        eq(printRuns.kind, "reprint"),
        sql`${printRuns.status} not in ('completed', 'cancelled')`
      )
    )
    .orderBy(desc(printRuns.createdAt))
    .limit(1);
  return row ?? null;
}
