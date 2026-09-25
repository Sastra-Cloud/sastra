import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  podcastStageSettings,
  projects,
  taskDependencies,
  tasks,
  units,
} from "@/lib/db/schema";
import { notify } from "@/lib/notifications";
import { insertTaskRow } from "@/lib/tasks/create";
import { clearTaskDueDateNotifications } from "@/lib/tasks/due-date-notifications";
import {
  calculateBackwardStageDates,
  PODCAST_STAGE_META,
  PODCAST_STAGES,
  requiredStages,
  stageDependencies,
  workflowProfile,
  type PodcastStage,
} from "./workflow";

type StageDefaults = Record<
  PodcastStage,
  { assigneeId: string | null; daysBeforePublication: number }
>;

export async function getPodcastStageDefaults(
  projectId: string
): Promise<StageDefaults> {
  const rows = await db
    .select()
    .from(podcastStageSettings)
    .where(eq(podcastStageSettings.projectId, projectId));
  const byStage = new Map(rows.map((row) => [row.stage, row]));
  return Object.fromEntries(
    PODCAST_STAGES.map((stage) => {
      const saved = byStage.get(stage);
      return [
        stage,
        {
          assigneeId: saved?.defaultAssigneeId ?? null,
          daysBeforePublication:
            saved?.daysBeforePublication ??
            PODCAST_STAGE_META[stage].defaultDaysBeforePublication,
        },
      ];
    })
  ) as StageDefaults;
}

/** Idempotently materialize the standard tasks and dependencies for an episode. */
export async function ensureEpisodeWorkflow(
  episodeId: string,
  actorId: string | null,
  opts?: { notifyAssignments?: boolean }
): Promise<{ createdTaskIds: string[]; taskCount: number }> {
  const [episode] = await db
    .select({
      id: units.id,
      name: units.name,
      projectId: units.projectId,
      status: units.status,
      scheduledDate: units.scheduledDate,
      publishedDate: units.publishedDate,
      videoRequiredOverride: units.videoRequiredOverride,
      projectVideoRequired: projects.videoRequired,
      projectKind: projects.kind,
      videoProductionMode: projects.videoProductionMode,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(units.id, episodeId))
    .limit(1);
  if (!episode) return { createdTaskIds: [], taskCount: 0 };

  const videoRequired = episode.videoRequiredOverride ?? episode.projectVideoRequired;
  const profile = workflowProfile({
    kind: episode.projectKind,
    videoProductionMode: episode.videoProductionMode,
    videoRequired,
  });
  const defaults = await getPodcastStageDefaults(episode.projectId);
  const existing = await db
    .select({ id: tasks.id, stage: tasks.podcastStage })
    .from(tasks)
    .where(
      and(eq(tasks.unitId, episode.id), inArray(tasks.podcastStage, PODCAST_STAGES))
    );
  const idsByStage = new Map<PodcastStage, string>();
  for (const row of existing) {
    if (row.stage) idsByStage.set(row.stage, row.id);
  }

  const targetDate = episode.scheduledDate ?? episode.publishedDate;
  const stages = requiredStages(profile);
  const dateUpdates = calculateBackwardStageDates(
    targetDate,
    Object.fromEntries(
      PODCAST_STAGES.map((stage) => [stage, defaults[stage].daysBeforePublication])
    ),
    stages.map((stage) => ({
      stage,
      // These tasks do not exist yet, so they are safe to backward-plan even
      // when the historical row will be inserted as completed.
      status: "todo",
      currentDueDate: null,
      dueDateIsManual: false,
    }))
  );
  const createdTaskIds: string[] = [];

  for (const stage of stages) {
    if (idsByStage.has(stage)) continue;
    const id = await insertTaskRow(
      {
        projectId: episode.projectId,
        unitId: episode.id,
        podcastStage: stage,
        title: `${episode.name}: ${PODCAST_STAGE_META[stage].label}`,
        status: episode.status === "draft" ? "todo" : "done",
        assignedTo: defaults[stage].assigneeId,
        dueDate: dateUpdates[stage] ?? targetDate,
        dueDateIsManual: false,
      },
      {
        actorId,
        revalidate: false,
        notifyAssignment: opts?.notifyAssignments,
      }
    );
    idsByStage.set(stage, id);
    createdTaskIds.push(id);
  }

  const edges = stageDependencies(profile)
    .map(({ stage, dependsOn }) => ({
      taskId: idsByStage.get(stage),
      dependsOnTaskId: idsByStage.get(dependsOn),
    }))
    .filter(
      (edge): edge is { taskId: string; dependsOnTaskId: string } =>
        Boolean(edge.taskId && edge.dependsOnTaskId)
    );
  const standardTaskIds = [...idsByStage.values()];
  await db.transaction(async (tx) => {
    if (standardTaskIds.length > 0) {
      await tx
        .delete(taskDependencies)
        .where(
          and(
            inArray(taskDependencies.taskId, standardTaskIds),
            inArray(taskDependencies.dependsOnTaskId, standardTaskIds)
          )
        );
    }
    if (edges.length > 0) {
      await tx.insert(taskDependencies).values(edges).onConflictDoNothing();
    }
  });
  return { createdTaskIds, taskCount: idsByStage.size };
}

export async function rescheduleEpisodeTasks(
  episodeId: string,
  targetDate: string | null
): Promise<number> {
  if (!targetDate) return 0;
  const [episode] = await db
    .select({ projectId: units.projectId })
    .from(units)
    .where(eq(units.id, episodeId))
    .limit(1);
  if (!episode) return 0;
  const defaults = await getPodcastStageDefaults(episode.projectId);
  const stageTasks = await db
    .select({
      id: tasks.id,
      stage: tasks.podcastStage,
      status: tasks.status,
      currentDueDate: tasks.dueDate,
      dueDateIsManual: tasks.dueDateIsManual,
    })
    .from(tasks)
    .where(
      and(eq(tasks.unitId, episodeId), inArray(tasks.podcastStage, PODCAST_STAGES))
    );
  const schedulable = stageTasks.filter(
    (task): task is typeof task & { stage: PodcastStage } => task.stage != null
  );
  const updates = calculateBackwardStageDates(
    targetDate,
    Object.fromEntries(
      PODCAST_STAGES.map((stage) => [stage, defaults[stage].daysBeforePublication])
    ),
    schedulable
  );
  let changed = 0;
  const changedTaskIds: string[] = [];
  for (const task of schedulable) {
    const dueDate = updates[task.stage];
    if (!dueDate || dueDate === task.currentDueDate) continue;
    await db
      .update(tasks)
      .set({ dueDate, updatedAt: new Date() })
      .where(eq(tasks.id, task.id));
    changedTaskIds.push(task.id);
    changed += 1;
  }
  await clearTaskDueDateNotifications(changedTaskIds);
  return changed;
}

/** Refuse to start/complete a standard stage while an earlier stage is open. */
export async function assertPodcastTaskDependenciesComplete(
  taskId: string
): Promise<void> {
  const dependencies = await db
    .select({ status: tasks.status })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnTaskId))
    .where(eq(taskDependencies.taskId, taskId));
  if (dependencies.some((dependency) => dependency.status !== "done")) {
    throw new Error("Complete the earlier production stage first.");
  }
}

/** Notify newly unblocked standard-stage assignees after a stage is completed. */
export async function notifyReadyEpisodeStages(
  completedTaskId: string,
  actorId: string
): Promise<void> {
  const [completed] = await db
    .select({
      unitId: tasks.unitId,
      stage: tasks.podcastStage,
      episodeName: units.name,
      projectSlug: projects.slug,
      projectTitle: projects.title,
      videoRequiredOverride: units.videoRequiredOverride,
      projectVideoRequired: projects.videoRequired,
      projectKind: projects.kind,
      videoProductionMode: projects.videoProductionMode,
    })
    .from(tasks)
    .innerJoin(units, eq(units.id, tasks.unitId))
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(tasks.id, completedTaskId))
    .limit(1);
  if (!completed?.unitId || !completed.stage) return;

  const videoRequired =
    completed.videoRequiredOverride ?? completed.projectVideoRequired;
  const profile = workflowProfile({
    kind: completed.projectKind,
    videoProductionMode: completed.videoProductionMode,
    videoRequired,
  });
  const nextStages = stageDependencies(profile)
    .filter((edge) => edge.dependsOn === completed.stage)
    .map((edge) => edge.stage);
  if (nextStages.length === 0) return;

  const allTasks = await db
    .select({
      id: tasks.id,
      stage: tasks.podcastStage,
      status: tasks.status,
      assignedTo: tasks.assignedTo,
      title: tasks.title,
    })
    .from(tasks)
    .where(
      and(eq(tasks.unitId, completed.unitId), inArray(tasks.podcastStage, PODCAST_STAGES))
    );
  const byStage = new Map(allTasks.map((task) => [task.stage, task]));
  for (const nextStage of nextStages) {
    const next = byStage.get(nextStage);
    if (!next || next.status !== "todo" || !next.assignedTo || next.assignedTo === actorId) {
      continue;
    }
    const dependencies = stageDependencies(profile)
      .filter((edge) => edge.stage === nextStage)
      .map((edge) => byStage.get(edge.dependsOn));
    if (dependencies.some((task) => task?.status !== "done")) continue;
    await notify({
      userId: next.assignedTo,
      type: "task_ready",
      title: `Ready for you: ${next.title}`,
      project: completed.projectTitle,
      link: `/projects/${completed.projectSlug}/episodes`,
      data: { taskId: next.id, episodeId: completed.unitId },
    });
  }
}
