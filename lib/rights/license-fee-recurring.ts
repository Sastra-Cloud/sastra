import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  licenseFeePayments,
  projectBudgetSettings,
  projects,
  rightsHolders,
  rightsItems,
} from "@/lib/db/schema";
import { insertTaskRow } from "@/lib/tasks/create";

const todayIso = () => new Date().toISOString().slice(0, 10);

function minusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Ensure a project's license-fee payment record(s) + their assigned reminder
 * task(s) exist. Requires a positive `licenseFeeAmount`. The reminder owner is
 * the configured `licenseFeeAssignedTo`, falling back to the project creator
 * (`projects.createdBy`) so a fee is never left without an owner. Idempotent:
 * each payment row insert is guarded by the unique (project, period) index, so a
 * task is only created when the row is newly inserted.
 *
 * Generates:
 *  - one "initial" payment (the first fee), always;
 *  - for a recurring fee, one payment per renewal keyed on the license expiry
 *    date, once inside the renewal lead window.
 */
export async function ensureLicenseFeePaymentsForProject(
  projectId: string,
  actorId: string | null
): Promise<boolean> {
  const [row] = await db
    .select({
      projectId: rightsItems.projectId,
      title: projects.title,
      createdBy: projects.createdBy,
      feeAmount: rightsItems.licenseFeeAmount,
      feeCurrency: rightsItems.licenseFeeCurrency,
      feeDueDate: rightsItems.licenseFeeDueDate,
      feeRecurs: rightsItems.licenseFeeRecurs,
      feeAssignee: rightsItems.licenseFeeAssignedTo,
      licenseSignedDate: rightsItems.licenseSignedDate,
      rightsStartDate: rightsItems.rightsStartDate,
      licenseExpiresDate: rightsItems.licenseExpiresDate,
      leadDays: rightsItems.licenseRenewalLeadDays,
      holderName: rightsHolders.name,
      budgetCurrency: projectBudgetSettings.currency,
    })
    .from(rightsItems)
    .innerJoin(projects, eq(projects.id, rightsItems.projectId))
    .leftJoin(rightsHolders, eq(rightsHolders.id, rightsItems.licenseHolderId))
    .leftJoin(
      projectBudgetSettings,
      eq(projectBudgetSettings.projectId, rightsItems.projectId)
    )
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);

  if (!row) return false;
  const amount = row.feeAmount;
  if (amount == null || Number(amount) <= 0) return false;

  // Default the fee owner to the project creator when unassigned.
  const assignee = row.feeAssignee || row.createdBy;
  if (!assignee) return false;
  const currency = row.feeCurrency || row.budgetCurrency || "USD";

  let created = 0;
  const ensure = async (period: string, due: string | null, isRenewal: boolean) => {
    const [pay] = await db
      .insert(licenseFeePayments)
      .values({
        projectId: row.projectId,
        period,
        amount: String(amount),
        currency,
        dueDate: due,
        assigneeId: assignee,
        createdBy: actorId,
      })
      .onConflictDoNothing({
        target: [licenseFeePayments.projectId, licenseFeePayments.period],
      })
      .returning({ id: licenseFeePayments.id });
    if (!pay) return; // already exists — don't duplicate the task

    const title = isRenewal
      ? `Pay license renewal fee for ${row.title}${due ? ` (renews ${due})` : ""}`
      : `Pay license fee for ${row.title}`;
    const description = [
      `${isRenewal ? "License renewal fee" : "License fee"} for ${row.title}: ${currency} ${Number(
        amount
      ).toFixed(2)}.`,
      row.holderName ? `Licensor: ${row.holderName}.` : null,
      due ? `Due ${due}.` : null,
      "Mark it paid on the project's Rights or Budget page once settled.",
    ]
      .filter(Boolean)
      .join("\n");

    const taskId = await insertTaskRow(
      {
        projectId: row.projectId,
        title,
        description,
        assignedTo: assignee,
        priority: "high",
        dueDate: due ?? null,
      },
      { actorId, revalidate: false }
    );
    await db
      .update(licenseFeePayments)
      .set({ taskId })
      .where(eq(licenseFeePayments.id, pay.id));
    created += 1;
  };

  // The first fee — due when configured, else when the license was signed / rights start / now.
  const initialDue =
    row.feeDueDate || row.licenseSignedDate || row.rightsStartDate || todayIso();
  await ensure("initial", initialDue, false);

  // Recurring renewal fee — a fresh payable per term, once inside the lead window.
  if (row.feeRecurs && row.licenseExpiresDate) {
    const threshold = minusDays(row.licenseExpiresDate, row.leadDays ?? 30);
    if (todayIso() >= threshold) {
      await ensure(row.licenseExpiresDate, row.licenseExpiresDate, true);
    }
  }

  return created > 0;
}

/** Generate due license-fee payments for every project with a fee set. Daily cron. */
export async function ensureLicenseFeePayments(): Promise<number> {
  const rows = await db
    .select({ projectId: rightsItems.projectId })
    .from(rightsItems)
    .where(and(isNotNull(rightsItems.licenseFeeAmount)));

  let created = 0;
  for (const r of rows) {
    try {
      if (await ensureLicenseFeePaymentsForProject(r.projectId, null)) created += 1;
    } catch {
      // skip this project
    }
  }
  return created;
}
