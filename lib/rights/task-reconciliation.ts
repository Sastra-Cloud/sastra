import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { logActivity } from "@/lib/activity/log";
import { db } from "@/lib/db";
import { phases, rightsHolders, rightsItems, tasks } from "@/lib/db/schema";

type OpenTaskCandidate = {
  id: string;
  title: string;
  phaseName: string | null;
};

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Choose a legacy task only when one open project task unambiguously describes
 * the now-satisfied rights step and names the approved holder. This deliberately
 * refuses fuzzy/acronym-only matches and multiple candidates.
 */
export function matchingSatisfiedRightsTask(
  candidates: readonly OpenTaskCandidate[],
  input: { step: "mou" | "license"; holderName: string | null }
) {
  const holder = normalized(input.holderName ?? "");
  const stepPattern =
    input.step === "license"
      ? /\b(rights?|licen[cs]e|permissions?)\b/
      : /\b(rights?|mou|memorandum|permissions?)\b/;
  const matches = candidates.filter((candidate) => {
    const title = normalized(candidate.title);
    const phase = normalized(candidate.phaseName ?? "");
    if (!stepPattern.test(title) && !/\brights?\b/.test(phase)) return false;
    return holder.length >= 3 && title.includes(holder);
  });
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Complete tasks made obsolete by signed rights. Explicit task links always
 * win; otherwise a strict holder + rights-title match is allowed only when
 * unique. Returns the task ids changed so callers can decide whether to bypass
 * health-refresh throttling.
 */
export async function reconcileSatisfiedRightsTasks(
  projectId: string,
  actorId: string | null
) {
  const [rights] = await db
    .select()
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  if (!rights) return [];

  const holderIds = [rights.mouHolderId, rights.licenseHolderId].filter(
    (id): id is string => !!id
  );
  const holderRows = holderIds.length
    ? await db
        .select({ id: rightsHolders.id, name: rightsHolders.name })
        .from(rightsHolders)
        .where(inArray(rightsHolders.id, holderIds))
    : [];
  const holderName = (id: string | null) =>
    holderRows.find((holder) => holder.id === id)?.name ?? null;
  const openTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      phaseName: phases.name,
    })
    .from(tasks)
    .leftJoin(phases, eq(phases.id, tasks.phaseId))
    .where(and(eq(tasks.projectId, projectId), ne(tasks.status, "done")));

  const completed: string[] = [];
  const steps = [
    {
      step: "mou" as const,
      signed: rights.mouStatus === "signed",
      explicitTaskId: rights.mouTaskId,
      holderId: rights.mouHolderId,
    },
    {
      step: "license" as const,
      signed: rights.licenseStatus === "signed",
      explicitTaskId: rights.licenseTaskId,
      holderId: rights.licenseHolderId,
    },
  ];

  for (const step of steps) {
    if (!step.signed) continue;
    const remaining = openTasks.filter((task) => !completed.includes(task.id));
    const task = step.explicitTaskId
      ? remaining.find((candidate) => candidate.id === step.explicitTaskId) ?? null
      : matchingSatisfiedRightsTask(remaining, {
          step: step.step,
          holderName: holderName(step.holderId),
        });
    if (!task) continue;

    const [updated] = await db
      .update(tasks)
      .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(tasks.id, task.id), ne(tasks.status, "done")))
      .returning({ id: tasks.id });
    if (!updated) continue;

    await db
      .update(rightsItems)
      .set(
        step.step === "mou"
          ? { mouTaskId: task.id, updatedAt: new Date() }
          : { licenseTaskId: task.id, updatedAt: new Date() }
      )
      .where(eq(rightsItems.id, rights.id));
    completed.push(task.id);
    await logActivity({
      actorId,
      projectId,
      entityType: "task",
      entityId: task.id,
      action: "complete_from_rights",
      summary: `Completed satisfied rights task: ${task.title}`,
    });
  }
  return completed;
}
