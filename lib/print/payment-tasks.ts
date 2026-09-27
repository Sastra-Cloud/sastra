import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  printPayments,
  printQuotes,
  printRuns,
  projectMembers,
  projectRoles,
  tasks,
  user,
} from "@/lib/db/schema";
import { clearOverdueNotifications } from "@/lib/notifications";
import { invoiceFilePaymentKinds } from "@/lib/print/quote-reconciliation";
import {
  isGeneratedPrinterPaymentTaskDescription,
  isGeneratedPrinterPaymentTaskTitle,
  printerPaymentTaskDescription,
  printerPaymentTaskTitle,
  type PrinterPaymentTaskStatus,
} from "@/lib/print/payment-task-copy";
import { insertTaskRow, revalidateForTask } from "@/lib/tasks/create";

async function printingCoordinator(projectId: string): Promise<string | null> {
  const [coordinator] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .innerJoin(projectRoles, eq(projectRoles.id, projectMembers.projectRoleId))
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectRoles.key, "printing"),
        eq(user.isActive, true),
        eq(user.isBot, false)
      )
    )
    .orderBy(asc(projectMembers.createdAt))
    .limit(1);
  return coordinator?.userId ?? null;
}

async function linkedTaskId(paymentId: string): Promise<string | null> {
  const [linked] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.printPaymentId, paymentId))
    .limit(1);
  return linked?.id ?? null;
}

/**
 * Create the single ordinary task that owns an actionable printer payment.
 * Accepted invoice extraction and direct payment uploads can race, so the
 * unique provenance column is the final idempotency guard.
 */
export async function ensurePrintPaymentTask(
  paymentId: string,
  actorId: string
): Promise<string | null> {
  const existing = await linkedTaskId(paymentId);
  if (existing) return existing;

  const [row] = await db
    .select({
      payment: printPayments,
      runTitle: printRuns.title,
      invoiceNumber: printQuotes.invoiceNumber,
    })
    .from(printPayments)
    .innerJoin(printRuns, eq(printRuns.id, printPayments.runId))
    .leftJoin(printQuotes, eq(printQuotes.id, printPayments.quoteId))
    .where(eq(printPayments.id, paymentId))
    .limit(1);
  if (!row || row.payment.paidAt) return null;

  const assigneeId =
    (await printingCoordinator(row.payment.projectId)) ?? actorId;
  const copy = {
    kind: row.payment.kind,
    amount: row.payment.amount,
    currency: row.payment.currency,
    runTitle: row.runTitle,
    invoiceNumber: row.invoiceNumber,
  };

  try {
    return await insertTaskRow(
      {
        projectId: row.payment.projectId,
        printRunId: row.payment.runId,
        printPaymentId: row.payment.id,
        title: printerPaymentTaskTitle(copy, row.payment.status === "requested" ? "requested" : "planned"),
        description: printerPaymentTaskDescription(
          copy,
          row.payment.status === "requested" ? "requested" : "planned"
        ),
        status: row.payment.status === "requested" ? "review" : "todo",
        priority: "high",
        assignedTo: assigneeId,
        dueDate: row.payment.dueDate ?? row.payment.neededByDate,
      },
      {
        actorId,
        activitySummary: `Created printer payment task for "${row.runTitle}"`,
      }
    );
  } catch (error) {
    // Concurrent invoice acceptance/upload may have won the unique insert.
    const constraint = (error as { code?: string }).code;
    if (constraint === "23505") return await linkedTaskId(paymentId);
    throw error;
  }
}

/** Create payment tasks only for accepted invoice records, never raw quotes. */
export async function ensureAcceptedInvoicePaymentTasks(
  quoteId: string,
  quoteKind: string,
  actorId: string
): Promise<void> {
  const paymentKinds = invoiceFilePaymentKinds(quoteKind);
  if (!paymentKinds.length) return;
  const rows = await db
    .select({ id: printPayments.id })
    .from(printPayments)
    .where(
      and(
        eq(printPayments.quoteId, quoteId),
        inArray(printPayments.kind, paymentKinds)
      )
    );
  for (const row of rows) await ensurePrintPaymentTask(row.id, actorId);
}

/** Keep the generated task aligned with the payment's real lifecycle. */
export async function syncPrintPaymentTaskStatus(
  paymentId: string,
  paymentStatus: PrinterPaymentTaskStatus
): Promise<void> {
  const status =
    paymentStatus === "paid"
      ? ("done" as const)
      : paymentStatus === "requested"
        ? ("review" as const)
        : ("todo" as const);
  const [linked] = await db
    .select({
      title: tasks.title,
      description: tasks.description,
      payment: printPayments,
      runTitle: printRuns.title,
      invoiceNumber: printQuotes.invoiceNumber,
    })
    .from(tasks)
    .innerJoin(printPayments, eq(printPayments.id, tasks.printPaymentId))
    .innerJoin(printRuns, eq(printRuns.id, printPayments.runId))
    .leftJoin(printQuotes, eq(printQuotes.id, printPayments.quoteId))
    .where(eq(tasks.printPaymentId, paymentId))
    .limit(1);
  if (!linked) return;
  const copy = {
    kind: linked.payment.kind,
    amount: linked.payment.amount,
    currency: linked.payment.currency,
    runTitle: linked.runTitle,
    invoiceNumber: linked.invoiceNumber,
  };
  const description = isGeneratedPrinterPaymentTaskDescription(copy, linked.description)
    ? printerPaymentTaskDescription(copy, paymentStatus)
    : linked.description;
  const title = isGeneratedPrinterPaymentTaskTitle(copy, linked.title)
    ? printerPaymentTaskTitle(copy, paymentStatus)
    : linked.title;
  const [task] = await db
    .update(tasks)
    .set({
      status,
      title: sql`CASE WHEN ${tasks.title} = ${linked.title} THEN ${title} ELSE ${tasks.title} END`,
      description: sql`CASE WHEN ${tasks.description} IS NOT DISTINCT FROM ${linked.description} THEN ${description} ELSE ${tasks.description} END`,
      completedAt: status === "done" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.printPaymentId, paymentId))
    .returning({ id: tasks.id, projectId: tasks.projectId });
  if (!task) return;
  if (status === "done") await clearOverdueNotifications(task.id);
  await revalidateForTask(task.projectId);
}
