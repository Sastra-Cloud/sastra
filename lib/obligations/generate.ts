import "server-only";

import { and, eq, ilike, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  licenseObligations,
  phases,
  projects,
  rightsItems,
  tasks,
} from "@/lib/db/schema";
import { createRecurringTask } from "@/lib/tasks/recurring-actions";
import { reportReminderAnchor, type Frequency } from "@/lib/recurring/schedule";

const todayIso = () => new Date().toISOString().slice(0, 10);

/** The agreement's signing/start date, used to anchor report reminders. */
async function agreementSignedDate(projectId: string): Promise<string | null> {
  const [r] = await db
    .select({
      license: rightsItems.licenseSignedDate,
      mou: rightsItems.mouSignedDate,
      start: rightsItems.rightsStartDate,
    })
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  return r?.license ?? r?.mou ?? r?.start ?? null;
}

/**
 * Cadences that mean "furnish a report every period" — each maps to a recurring
 * reminder task at the matching frequency, so the assignee is reminded on a
 * schedule (materialized daily by cron, then notified on assignment + overdue).
 */
export const RECURRING_REPORT_FREQ = {
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "annual",
} as const;

/** True when a cadence auto-generates an operational task (recurring or gate). */
export function cadenceGeneratesTask(cadence: string): boolean {
  return cadence in RECURRING_REPORT_FREQ || cadence === "per_artwork";
}

/** The project owner/creator — the default owner of a report reminder. */
export async function projectOwnerId(projectId: string): Promise<string | null> {
  const [p] = await db
    .select({ createdBy: projects.createdBy })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return p?.createdBy ?? null;
}

export type ObligationTaskInput = {
  cadence: string;
  label: string;
  text: string;
  assigneeId?: string | null;
  /** Agreement-stated first due date. Cadence defaults apply when omitted. */
  anchorDate?: string;
};

/**
 * Auto-generate the operational task for an obligation from its cadence:
 * `quarterly` → a recurring task rule; `per_artwork` → one milestone gate task;
 * everything else → no task (production rules surfaced in the UI). Shared by the
 * manual create action and the document-import commit path.
 */
export async function generateObligationTask(
  projectId: string,
  d: ObligationTaskInput,
  actorId: string
): Promise<{ recurringTaskId: string | null; taskId: string | null }> {
  const frequency =
    RECURRING_REPORT_FREQ[d.cadence as keyof typeof RECURRING_REPORT_FREQ];
  if (frequency) {
    // The agreement's explicit date wins. Otherwise annual reports close out
    // in January; monthly/quarterly reports begin one period after signing.
    const anchorDate = reportReminderAnchor(frequency as Frequency, {
      explicit: d.anchorDate,
      signedDate: await agreementSignedDate(projectId),
      today: todayIso(),
    });
    const res = await createRecurringTask({
      title: d.label,
      description: d.text,
      projectId,
      assigneeId: d.assigneeId ?? null,
      priority: "medium",
      frequency,
      anchorDate,
    });
    return { recurringTaskId: res.id ?? null, taskId: null };
  }

  if (d.cadence === "per_artwork") {
    const [rightsPhase] = await db
      .select({ id: phases.id })
      .from(phases)
      .where(
        and(eq(phases.projectId, projectId), ilike(phases.name, "%rights%"))
      )
      .limit(1);
    const [task] = await db
      .insert(tasks)
      .values({
        projectId,
        phaseId: rightsPhase?.id ?? null,
        title: d.label,
        description: d.text,
        status: "todo",
        priority: "high",
        isMilestone: true,
        assignedTo: d.assigneeId ?? null,
        createdBy: actorId,
      })
      .returning({ id: tasks.id });
    return { recurringTaskId: null, taskId: task.id };
  }

  return { recurringTaskId: null, taskId: null };
}

/**
 * Wire operational tasks for a project's obligations that don't have one yet.
 * Used after import commit, where obligation rows are inserted inside the
 * transaction but recurring-rule materialization must run afterward.
 */
export async function generateObligationTasksForProject(
  projectId: string,
  actorId: string
): Promise<void> {
  const rows = await db
    .select({
      id: licenseObligations.id,
      cadence: licenseObligations.cadence,
      label: licenseObligations.label,
      text: licenseObligations.text,
      assigneeId: licenseObligations.assigneeId,
      firstDueDate: licenseObligations.firstDueDate,
    })
    .from(licenseObligations)
    .where(
      and(
        eq(licenseObligations.projectId, projectId),
        isNull(licenseObligations.recurringTaskId),
        isNull(licenseObligations.taskId)
      )
    );

  // Report reminders (and gate tasks) default to the project owner so someone
  // is actually reminded when an import extracts them without an assignee.
  const ownerId = await projectOwnerId(projectId);

  for (const o of rows) {
    if (!cadenceGeneratesTask(o.cadence)) continue;
    const assigneeId = o.assigneeId ?? ownerId;
    const { recurringTaskId, taskId } = await generateObligationTask(
      projectId,
      {
        cadence: o.cadence,
        label: o.label,
        text: o.text,
        assigneeId,
        anchorDate: o.firstDueDate ?? undefined,
      },
      actorId
    );
    await db
      .update(licenseObligations)
      .set({ assigneeId, recurringTaskId, taskId, updatedAt: new Date() })
      .where(eq(licenseObligations.id, o.id));
  }
}
