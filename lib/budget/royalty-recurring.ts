import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projectBudgetSettings, projects, royaltyPayments } from "@/lib/db/schema";
import { insertTaskRow } from "@/lib/tasks/create";
import { nextDueDate, periodKey, type Frequency } from "@/lib/recurring/schedule";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Build the cadence anchor (this year's due month/day, day-clamped). */
function royaltyAnchor(dueMonth: number, dueDay: number): string {
  const year = new Date().getUTCFullYear();
  const lastDay = new Date(Date.UTC(year, dueMonth, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return `${year}-${String(dueMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Ensure the current period's royalty payment record + its assigned task exist.
 * Requires royalties on, an owner, an anchor day/month, and a positive amount.
 * Idempotent: the payment row insert is guarded by the unique (project, period)
 * index, so the task is only created when the row is newly inserted.
 */
export async function ensureRoyaltyPaymentForProject(
  projectId: string,
  actorId: string | null
): Promise<boolean> {
  const [project] = await db
    .select({
      id: projects.id,
      title: projects.title,
      requiresRoyalties: projects.requiresRoyalties,
      royaltyPercentage: projects.royaltyPercentage,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project?.requiresRoyalties) return false;

  const [s] = await db
    .select()
    .from(projectBudgetSettings)
    .where(eq(projectBudgetSettings.projectId, projectId))
    .limit(1);
  if (!s) return false;

  const amount = s.royaltyAmount;
  if (
    !s.royaltyTaskAssigneeId ||
    !s.royaltyDueMonth ||
    !s.royaltyDueDay ||
    amount == null ||
    Number(amount) <= 0
  ) {
    return false;
  }

  const frequency = (s.royaltyFrequency ?? "annual") as Frequency;
  const anchor = royaltyAnchor(s.royaltyDueMonth, s.royaltyDueDay);
  const due = nextDueDate(anchor, frequency, todayIso());
  if (!due) return false;
  const period = periodKey(due, frequency);
  const currency = s.royaltyCurrency ?? s.currency;

  // Insert the payment first (atomic dedupe); only create the task if newly added.
  const [pay] = await db
    .insert(royaltyPayments)
    .values({
      projectId,
      period,
      amount: String(amount),
      currency,
      dueDate: due,
      recipientEmail: s.royaltyRecipientEmail ?? null,
      assigneeId: s.royaltyTaskAssigneeId,
      createdBy: actorId,
    })
    .onConflictDoNothing({
      target: [royaltyPayments.projectId, royaltyPayments.period],
    })
    .returning({ id: royaltyPayments.id });
  if (!pay) return false;

  const title = `Pay ${period} royalty for ${project.title}`;
  const description = [
    `Royalty payment for ${project.title} — period ${period}.`,
    `Amount: ${currency} ${Number(amount).toFixed(2)}.`,
    s.royaltyRecipientEmail ? `Recipient: ${s.royaltyRecipientEmail}.` : null,
    project.royaltyPercentage ? `Rate: ${project.royaltyPercentage}%.` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const taskId = await insertTaskRow(
    {
      projectId,
      title,
      description,
      assignedTo: s.royaltyTaskAssigneeId,
      priority: "high",
      dueDate: due,
    },
    { actorId, revalidate: false }
  );
  await db
    .update(royaltyPayments)
    .set({ taskId })
    .where(eq(royaltyPayments.id, pay.id));
  return true;
}

/** Generate due royalty payments for every project with royalties on. Daily cron. */
export async function generateDueRoyaltyPayments(): Promise<number> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.requiresRoyalties, true));

  let created = 0;
  for (const r of rows) {
    try {
      if (await ensureRoyaltyPaymentForProject(r.id, null)) created += 1;
    } catch {
      // skip this project
    }
  }
  return created;
}
