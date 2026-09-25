import "server-only";

import { and, eq, ne, inArray } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";

import { db } from "@/lib/db";
import {
  invoices,
  files,
  mouPayments,
  projects,
  sharedMouGroups,
  sharedMouMemberships,
  tasks,
  user,
} from "@/lib/db/schema";
import { notify, clearOverdueNotifications } from "@/lib/notifications";
import { evaluateSharedMouReadiness } from "./readiness";
import { getWorkspaceSettings } from "@/lib/workspace/queries";

const todayIso = (now = new Date(), timezone = "UTC") =>
  formatInTimeZone(now, timezone, "yyyy-MM-dd");

function money(value: string, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

export async function getSharedPaymentReadiness(
  paymentId: string,
  now = new Date()
) {
  const [paymentRows, workspace] = await Promise.all([db
    .select({
      id: mouPayments.id,
      groupId: mouPayments.sharedMouGroupId,
      dueDate: mouPayments.dueDate,
      trigger: mouPayments.trigger,
      deliveryRequirements: mouPayments.deliveryRequirements,
      deliveryEvidence: mouPayments.deliveryEvidence,
      deliveryConfirmedAt: mouPayments.deliveryConfirmedAt,
      paidAt: mouPayments.paidAt,
    })
    .from(mouPayments)
    .where(eq(mouPayments.id, paymentId))
    .limit(1), getWorkspaceSettings()]);
  const [payment] = paymentRows;
  if (!payment?.groupId) return null;
  const [members, invoice, groups, installments] = await Promise.all([
    db
      .select({ title: projects.title, status: projects.status, allocationAmount: sharedMouMemberships.allocationAmount })
      .from(sharedMouMemberships)
      .innerJoin(projects, eq(projects.id, sharedMouMemberships.projectId))
      .where(
        and(
          eq(sharedMouMemberships.groupId, payment.groupId),
          eq(sharedMouMemberships.active, true)
        )
      ),
    db
      .select({ id: invoices.id, status: invoices.status })
      .from(invoices)
      .where(and(eq(invoices.mouPaymentId, payment.id), ne(invoices.status, "void")))
      .limit(1),
    db.select().from(sharedMouGroups).where(eq(sharedMouGroups.id, payment.groupId)).limit(1),
    db.select({ amount: mouPayments.amount }).from(mouPayments)
      .where(eq(mouPayments.sharedMouGroupId, payment.groupId)),
  ]);
  const group = groups[0];
  const totalCents = Math.round(Number(group?.agreementTotal) * 100);
  const allocatedCents = members.reduce((sum, row) => sum + Math.round(Number(row.allocationAmount) * 100), 0);
  const scheduledCents = installments.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  const reconciliationError = !group || group.reviewRequired
    ? group?.reviewNote || "Agreement requires manager review."
    : totalCents <= 0 || allocatedCents !== totalCents || scheduledCents !== totalCents
      ? "Project allocations and installments must each equal the agreement total."
      : null;
  const evidenceFileIds = (payment.deliveryEvidence ?? []).flatMap((item) => item.fileId ? [item.fileId] : []);
  const availableFiles = evidenceFileIds.length ? await db.select({ id: files.id }).from(files)
    .where(and(inArray(files.id, evidenceFileIds), eq(files.status, "ready"))) : [];
  const availableIds = new Set(availableFiles.map((file) => file.id));
  const readiness = evaluateSharedMouReadiness({
    members,
    reconciliationError,
    deliveryRequirements: payment.deliveryRequirements,
    deliveryEvidence: payment.deliveryEvidence?.filter((item) => !item.fileId || availableIds.has(item.fileId)),
    deliveryConfirmed: Boolean(payment.deliveryConfirmedAt),
    earliestInvoiceDate: payment.dueDate,
    today: todayIso(now, workspace.timezone),
    invoiced: Boolean(invoice[0]),
    sent: invoice[0]?.status === "sent",
    received: Boolean(payment.paidAt),
    requiresCollectiveCompletion: payment.trigger === "on_completion",
  });
  return invoice[0]?.status === "sending" && readiness.status === "invoiced"
    ? { ...readiness, reason: "Delivery outcome unconfirmed. Check correspondence before retrying." }
    : readiness;
}

/** Recompute group gates and create at most one task/notification per payment. */
export async function reevaluateSharedMouPayments(input?: {
  groupId?: string;
  projectId?: string;
  actorId?: string | null;
  now?: Date;
}): Promise<number> {
  const workspace = await getWorkspaceSettings();
  const rows = await db
    .select({
      id: mouPayments.id,
      groupId: mouPayments.sharedMouGroupId,
      amount: mouPayments.amount,
      currency: mouPayments.currency,
      trigger: mouPayments.trigger,
      dueDate: mouPayments.dueDate,
      notes: mouPayments.notes,
      invoiceAssigneeId: mouPayments.invoiceAssigneeId,
      invoiceTaskId: mouPayments.invoiceTaskId,
      administrativeProjectId: sharedMouGroups.administrativeProjectId,
      groupName: sharedMouGroups.name,
    })
    .from(mouPayments)
    .innerJoin(
      sharedMouGroups,
      eq(sharedMouGroups.id, mouPayments.sharedMouGroupId)
    )
    .leftJoin(
      sharedMouMemberships,
      and(
        eq(sharedMouMemberships.groupId, sharedMouGroups.id),
        eq(sharedMouMemberships.active, true)
      )
    )
    .where(
      and(
        input?.groupId ? eq(sharedMouGroups.id, input.groupId) : undefined,
        input?.projectId
          ? eq(sharedMouMemberships.projectId, input.projectId)
          : undefined
      )
    );
  const payments = [...new Map(rows.map((row) => [row.id, row])).values()];
  let created = 0;

  for (const payment of payments) {
    const readiness = await getSharedPaymentReadiness(
      payment.id,
      input?.now ?? new Date()
    );
    if (!readiness) continue;
    await db
      .update(mouPayments)
      .set({
        readinessStatus: readiness.status,
        readinessReason: readiness.reason,
        readinessEvaluatedAt: new Date(),
      })
      .where(eq(mouPayments.id, payment.id));

    const recipients = await db.select({ id: user.id, name: user.name })
      .from(sharedMouMemberships)
      .innerJoin(projects, eq(projects.id, sharedMouMemberships.projectId))
      .innerJoin(user, eq(user.id, projects.createdBy))
      .where(and(eq(sharedMouMemberships.groupId, payment.groupId!),
        eq(sharedMouMemberships.active, true), eq(user.isActive, true),
        eq(user.isBot, false), inArray(user.role, ["manager", "admin", "super_admin"])));
    const [owner] = payment.invoiceAssigneeId ? await db.select({ id: user.id, name: user.name })
      .from(user).where(and(eq(user.id, payment.invoiceAssigneeId), eq(user.isActive, true),
        eq(user.isBot, false), inArray(user.role, ["manager", "admin", "super_admin"]))).limit(1) : [];
    const deliveryWork = readiness.status === "locked" && readiness.reason.startsWith("Delivery evidence");
    const actionable = readiness.status === "ready" || readiness.status === "invoiced" || deliveryWork;
    const finished = readiness.status === "sent" || readiness.status === "received";
    const label = payment.trigger === "on_signing" ? "signing" : payment.trigger === "on_completion" ? "final" : "installment";
    const title = `${deliveryWork ? "Confirm delivery and send final invoice" : readiness.status === "invoiced"
      ? readiness.reason.startsWith("Delivery outcome") ? "Check invoice delivery" : "Review and send invoice" : finished ? `Send ${label} invoice` : actionable
        ? `Send ${label} invoice` : "Invoice paused"} — ${payment.groupName}`;
    const taskId = await db.transaction(async (tx) => {
      const [current] = await tx.select({ taskId: mouPayments.invoiceTaskId })
        .from(mouPayments).where(eq(mouPayments.id, payment.id)).for("update");
      if (!current) return null;
      const description = `${readiness.reason}\n${money(payment.amount, payment.currency)}. ${payment.notes ?? ""}\n\nReview: /agreements/${payment.groupId}`;
      if (current.taskId) {
        await tx.update(tasks).set({ title, description,
          assignedTo: owner?.id ?? null,
          status: finished ? "done" : "todo", completedAt: finished ? new Date() : null,
          updatedAt: new Date(),
        }).where(eq(tasks.id, current.taskId));
        return current.taskId;
      }
      if (!actionable || !owner) return null;
      const [task] = await tx.insert(tasks).values({
        projectId: payment.administrativeProjectId, title, description,
        status: "todo", priority: "high", assignedTo: owner.id,
        createdBy: input?.actorId ?? null, dueDate: todayIso(input?.now, workspace.timezone),
      }).returning({ id: tasks.id });
      await tx.update(mouPayments).set({ invoiceTaskId: task.id, invoiceRequestedAt: new Date() })
        .where(eq(mouPayments.id, payment.id));
      created += 1;
      return task.id;
    });
    if (!taskId) continue;
    if (!actionable || !owner) await clearOverdueNotifications(taskId);
    // PDF generation changes the next action, without repeating readiness alerts.
    if (readiness.status === "invoiced" || (!actionable && !finished)) continue;
    const invoiceVersions = await db.select({ id: invoices.id }).from(invoices)
      .where(eq(invoices.mouPaymentId, payment.id));
    const event = deliveryWork ? "delivery" : readiness.status;
    const audience = new Map(recipients.map((recipient) => [recipient.id, recipient]));
    if (owner) audience.set(owner.id, owner);
    for (const recipient of audience.values()) {
      await notify({
        userId: recipient.id,
        eventKey: `shared-payment:${payment.id}:${event}:${invoiceVersions.length}:${owner?.id ?? "unassigned"}`,
        type: "invoice_ready",
        title: `${finished ? readiness.status === "received" ? "Funds received" : "Invoice sent" : deliveryWork ? "Confirm delivery" : "Invoice ready"}: ${payment.groupName}`,
        body: `${label} installment · Owner: ${owner?.name ?? "unassigned"}. ${readiness.reason}`,
        link: `/agreements/${payment.groupId}#payment-${payment.id}`,
        data: { taskId, groupId: payment.groupId, paymentId: payment.id },
      });
    }
  }
  return created;
}
