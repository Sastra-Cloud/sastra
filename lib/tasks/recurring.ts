import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { recurringTasks, tasks } from "@/lib/db/schema";
import { nextDueDate, type Frequency } from "@/lib/recurring/schedule";
import { insertTaskRow } from "./create";

const todayIso = () => new Date().toISOString().slice(0, 10);

type RecurringRule = typeof recurringTasks.$inferSelect;

/** Materialize the next upcoming occurrence for one rule (idempotent). */
async function materializeRule(rule: RecurringRule): Promise<boolean> {
  const due = nextDueDate(
    rule.anchorDate,
    rule.frequency as Frequency,
    todayIso(),
    rule.endDate
  );
  if (!due) return false;

  const [existing] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.sourceRecurringTaskId, rule.id), eq(tasks.dueDate, due)))
    .limit(1);
  if (existing) return false;

  await insertTaskRow(
    {
      projectId: rule.projectId,
      title: rule.title,
      description: rule.description,
      assignedTo: rule.assigneeId,
      priority: rule.priority,
      isMilestone: rule.isMilestone,
      estimateHours: rule.estimateHours,
      dueDate: due,
      sourceRecurringTaskId: rule.id,
    },
    { actorId: rule.createdBy ?? null, revalidate: false }
  );

  await db
    .update(recurringTasks)
    .set({ lastGeneratedDate: due, updatedAt: new Date() })
    .where(eq(recurringTasks.id, rule.id));
  return true;
}

/**
 * Materialize the next occurrence for every active rule. Best-effort (one bad
 * rule never aborts the batch). Run daily by cron.
 */
export async function generateDueRecurringTasks(): Promise<number> {
  const rules = await db
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.isActive, true));

  let created = 0;
  for (const rule of rules) {
    try {
      if (await materializeRule(rule)) created += 1;
    } catch {
      // skip this rule
    }
  }
  return created;
}

/** Eagerly materialize one rule's first task (called right after a rule is created). */
export async function materializeRuleById(ruleId: string): Promise<boolean> {
  const [rule] = await db
    .select()
    .from(recurringTasks)
    .where(eq(recurringTasks.id, ruleId))
    .limit(1);
  if (!rule || !rule.isActive) return false;
  try {
    return await materializeRule(rule);
  } catch {
    return false;
  }
}
