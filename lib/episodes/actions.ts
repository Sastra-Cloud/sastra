"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/policy";
import { isEpisodicKind } from "@/lib/projects/kinds";
import { requestEpisodeMilestoneMouInvoices } from "@/lib/budget/actions";
import { db } from "@/lib/db";
import {
  podcastStageSettings,
  projectMembers,
  projects,
  tasks,
  units,
  user,
} from "@/lib/db/schema";
import { notifyAssignment, revalidateForTask } from "@/lib/tasks/create";
import { updateTaskStatus } from "@/lib/tasks/actions";
import { reconcileTaskDueDateChange } from "@/lib/tasks/due-date-notifications";
import {
  ensureEpisodeWorkflow,
  getPodcastStageDefaults,
  rescheduleEpisodeTasks,
} from "./workflow-service";
import {
  ALL_BULK_PRODUCTION_STATUSES,
  PODCAST_STAGES,
  productionStatusTaskPreset,
  stageOffsetsFollowSequence,
  VIDEO_STAGES,
  type PodcastStage,
  workflowProfile,
  requiredStages,
} from "./workflow";

const todayIso = () => new Date().toISOString().slice(0, 10);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const statusSchema = z.enum(["draft", "scheduled", "published"]);
const taskStatusSchema = z.enum(["todo", "in_progress", "review", "done"]);
const stageSchema = z.enum(PODCAST_STAGES);
const productionStatusSchema = z.enum(ALL_BULK_PRODUCTION_STATUSES);

async function revalidateEpisodes(projectId: string) {
  const [project] = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return;
  revalidatePath(`/projects/${project.slug}/episodes`);
  revalidatePath(`/projects/${project.slug}/tasks`);
  revalidatePath(`/projects/${project.slug}/budget`);
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/workload");
}

async function episodeProjectId(episodeId: string): Promise<string | null> {
  const [episode] = await db
    .select({ projectId: units.projectId })
    .from(units)
    .where(eq(units.id, episodeId))
    .limit(1);
  return episode?.projectId ?? null;
}

async function assertAssignable(projectId: string, userId: string | null) {
  if (!userId) return;
  const [member] = await db
    .select({ id: user.id })
    .from(projectMembers)
    .innerJoin(user, eq(user.id, projectMembers.userId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
        eq(user.isActive, true),
        eq(user.isBot, false)
      )
    )
    .limit(1);
  if (!member) throw new Error("Choose an active member of this project.");
}

export async function setEpisodeStatus(
  episodeId: string,
  status: z.input<typeof statusSchema>
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("manager");
  const next = statusSchema.parse(status);
  const [episode] = await db
    .select({
      id: units.id,
      projectId: units.projectId,
      publishedDate: units.publishedDate,
      projectKind: projects.kind,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(units.id, episodeId))
    .limit(1);
  if (!episode) return { error: "Episode not found." };

  await db
    .update(units)
    .set({
      status: next,
      publishedDate:
        next === "published" ? episode.publishedDate ?? todayIso() : null,
    })
    .where(eq(units.id, episodeId));
  if (next === "published" && episode.projectKind === "podcast") {
    await requestEpisodeMilestoneMouInvoices(episode.projectId, actor.id);
  }
  await recomputeProjectBlockers(episode.projectId);
  await revalidateEpisodes(episode.projectId);
  return {};
}

export async function setEpisodeSchedule(
  episodeId: string,
  scheduledDate: string | null
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("manager");
  const value = dateSchema.parse(scheduledDate || null);
  const projectId = await episodeProjectId(episodeId);
  if (!projectId) return { error: "Episode not found." };
  await ensureEpisodeWorkflow(episodeId, actor.id);
  await db.update(units).set({ scheduledDate: value }).where(eq(units.id, episodeId));
  await rescheduleEpisodeTasks(episodeId, value);
  await revalidateEpisodes(projectId);
  return {};
}

const renameSchema = z.string().trim().min(1).max(200);

export async function renameEpisode(
  episodeId: string,
  name: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  const parsed = renameSchema.safeParse(name);
  if (!parsed.success) return { error: "Episode name is required." };
  const [episode] = await db
    .update(units)
    .set({ name: parsed.data })
    .where(eq(units.id, episodeId))
    .returning({ projectId: units.projectId });
  if (episode) await revalidateEpisodes(episode.projectId);
  return {};
}

export async function setEpisodeOwner(
  episodeId: string,
  ownerId: string | null
): Promise<{ error?: string }> {
  await requireRole("manager");
  const projectId = await episodeProjectId(episodeId);
  if (!projectId) return { error: "Episode not found." };
  try {
    await assertAssignable(projectId, ownerId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid owner." };
  }
  await db.update(units).set({ ownerId }).where(eq(units.id, episodeId));
  await revalidateEpisodes(projectId);
  return {};
}

export async function setEpisodeVideoRequirement(
  episodeId: string,
  value: boolean | null
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("manager");
  const [episode] = await db
    .select({ projectId: units.projectId, kind: projects.kind })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(units.id, episodeId))
    .limit(1);
  if (!episode) return { error: "Episode not found." };
  if (episode.kind === "video_series") {
    return { error: "Video is required for every video-series unit." };
  }
  const projectId = episode.projectId;
  await db
    .update(units)
    .set({ videoRequiredOverride: value })
    .where(eq(units.id, episodeId));
  await ensureEpisodeWorkflow(episodeId, actor.id);
  await revalidateEpisodes(projectId);
  return {};
}

export async function setEpisodeStageAssignee(
  episodeId: string,
  stage: PodcastStage,
  assigneeId: string | null
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("manager");
  const parsedStage = stageSchema.parse(stage);
  const projectId = await episodeProjectId(episodeId);
  if (!projectId) return { error: "Episode not found." };
  try {
    await assertAssignable(projectId, assigneeId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid assignee." };
  }
  await ensureEpisodeWorkflow(episodeId, actor.id);
  const [task] = await db
    .update(tasks)
    .set({ assignedTo: assigneeId, updatedAt: new Date() })
    .where(and(eq(tasks.unitId, episodeId), eq(tasks.podcastStage, parsedStage)))
    .returning({ id: tasks.id });
  if (task) await notifyAssignment(task.id, assigneeId, actor.id);
  await revalidateEpisodes(projectId);
  return {};
}

export async function setEpisodeStageStatus(
  taskId: string,
  status: z.input<typeof taskStatusSchema>
): Promise<{ error?: string }> {
  const session = await requireUser();
  const next = taskStatusSchema.parse(status);
  const [task] = await db
    .select({
      projectId: tasks.projectId,
      assignedTo: tasks.assignedTo,
      stage: tasks.podcastStage,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!task?.stage) return { error: "Production stage task not found." };
  if (!can(session.user.role, "tasks.manage") && task.assignedTo !== session.user.id) {
    return { error: "You can only update production stages assigned to you." };
  }
  await updateTaskStatus(taskId, next);
  return {};
}

export async function setEpisodeStageDueDate(
  taskId: string,
  dueDate: string | null
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("manager");
  const value = dateSchema.parse(dueDate || null);
  const [before] = await db
    .select({ dueDate: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), inArray(tasks.podcastStage, PODCAST_STAGES)))
    .limit(1);
  const [task] = await db
    .update(tasks)
    .set({ dueDate: value, dueDateIsManual: true, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), inArray(tasks.podcastStage, PODCAST_STAGES)))
    .returning({ projectId: tasks.projectId });
  if (!task) return { error: "Production stage task not found." };
  await reconcileTaskDueDateChange({
    taskId,
    previousDueDate: before?.dueDate ?? null,
    actorId: actor.id,
  });
  await revalidateForTask(task.projectId);
  return {};
}

const settingsSchema = z.object({
  videoRequired: z.boolean(),
  stages: z.array(
    z.object({
      stage: stageSchema,
      defaultAssigneeId: z.string().nullable(),
      daysBeforePublication: z.coerce.number().int().min(0).max(365),
    })
  ),
});

export async function updatePodcastWorkflowSettings(
  projectId: string,
  input: z.input<typeof settingsSchema>
): Promise<{ error?: string }> {
  const { user: actor } = await requireRole("manager");
  const data = settingsSchema.parse(input);
  const [project] = await db
    .select({
      kind: projects.kind,
      videoProductionMode: projects.videoProductionMode,
      videoRequired: projects.videoRequired,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!isEpisodicKind(project?.kind)) return { error: "Episodic project not found." };
  const profile = workflowProfile({
    kind: project.kind,
    videoProductionMode: project.videoProductionMode,
    videoRequired: project.kind === "video_series" ? true : data.videoRequired,
  });
  const offsets = Object.fromEntries(
    data.stages.map((setting) => [setting.stage, setting.daysBeforePublication])
  );
  if (!stageOffsetsFollowSequence(offsets, profile)) {
    return {
      error:
        "Earlier production steps must be due at least as many days before publication as later steps.",
    };
  }
  for (const setting of data.stages) {
    await assertAssignable(projectId, setting.defaultAssigneeId);
  }
  await db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({
        videoRequired: project.kind === "video_series" ? true : data.videoRequired,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
    for (const setting of data.stages) {
      await tx
        .insert(podcastStageSettings)
        .values({ projectId, ...setting })
        .onConflictDoUpdate({
          target: [podcastStageSettings.projectId, podcastStageSettings.stage],
          set: {
            defaultAssigneeId: setting.defaultAssigneeId,
            daysBeforePublication: setting.daysBeforePublication,
            updatedAt: new Date(),
          },
        });
    }
  });
  const episodes = await db
    .select({ id: units.id, scheduledDate: units.scheduledDate })
    .from(units)
    .where(eq(units.projectId, projectId));
  for (const episode of episodes) {
    await ensureEpisodeWorkflow(episode.id, actor.id);
    if (episode.scheduledDate) {
      await rescheduleEpisodeTasks(episode.id, episode.scheduledDate);
    }
  }
  await revalidateEpisodes(projectId);
  return {};
}

const bulkCreateSchema = z.object({
  count: z.coerce.number().int().min(1).max(500),
  prefix: z.string().trim().max(60).optional(),
});

export async function bulkCreateEpisodes(
  projectId: string,
  input: z.input<typeof bulkCreateSchema>
): Promise<{ error?: string; created?: number }> {
  const { user: actor } = await requireRole("manager");
  const { count, prefix } = bulkCreateSchema.parse(input);
  const [project] = await db
    .select({ kind: projects.kind })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!isEpisodicKind(project?.kind)) return { error: "Episodic project not found." };
  const label = prefix?.trim() || (project.kind === "video_series" ? "Video" : "Episode");
  const existing = await db
    .select({ orderIndex: units.orderIndex })
    .from(units)
    .where(eq(units.projectId, projectId))
    .orderBy(asc(units.orderIndex));
  const startIndex = existing.length;
  const created = await db
    .insert(units)
    .values(
      Array.from({ length: count }, (_, index) => ({
        projectId,
        name: `${label} ${startIndex + index + 1}`,
        orderIndex: startIndex + index,
      }))
    )
    .returning({ id: units.id });
  for (const episode of created) await ensureEpisodeWorkflow(episode.id, actor.id);
  await revalidateEpisodes(projectId);
  return { created: created.length };
}

export async function deleteEpisode(
  episodeId: string
): Promise<{ error?: string }> {
  await requireRole("manager");
  const [episode] = await db
    .delete(units)
    .where(eq(units.id, episodeId))
    .returning({ projectId: units.projectId });
  if (episode) await revalidateEpisodes(episode.projectId);
  return {};
}

/** Repair missing standard tasks without sending a burst of historical alerts. */
export async function repairPodcastWorkflows(
  projectId: string
): Promise<{
  error?: string;
  episodesChecked?: number;
  createdTasks?: number;
}> {
  await requireRole("manager");
  const [project] = await db
    .select({ kind: projects.kind })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!isEpisodicKind(project?.kind))
    return { error: "Episodic project not found." };

  const episodes = await db
    .select({ id: units.id })
    .from(units)
    .where(eq(units.projectId, projectId));
  let createdTasks = 0;
  for (const episode of episodes) {
    const result = await ensureEpisodeWorkflow(episode.id, null, {
      notifyAssignments: false,
    });
    createdTasks += result.createdTaskIds.length;
  }
  await revalidateEpisodes(projectId);
  return { episodesChecked: episodes.length, createdTasks };
}

const bulkOperationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owner"), ownerId: z.string().nullable() }),
  z.object({
    kind: z.literal("stage_assignee"),
    stage: stageSchema,
    assigneeId: z.string().nullable(),
  }),
  z.object({ kind: z.literal("assign_defaults") }),
  z.object({
    kind: z.literal("production_status"),
    status: productionStatusSchema,
  }),
  z.object({ kind: z.literal("target_date"), date: dateSchema }),
  z.object({
    kind: z.literal("date_cadence"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    intervalDays: z.coerce.number().int().min(1).max(365),
  }),
  z.object({ kind: z.literal("video"), value: z.boolean().nullable() }),
]);

export type EpisodeBulkOperation = z.input<typeof bulkOperationSchema>;
export type EpisodeBulkResult = {
  succeeded: number;
  failed: { episodeId: string; error: string }[];
  affectedTaskCount: number;
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Manager-only bulk mutation with per-episode results for partial failures. */
export async function bulkUpdateEpisodes(
  projectId: string,
  episodeIds: string[],
  operation: EpisodeBulkOperation
): Promise<EpisodeBulkResult> {
  const { user: actor } = await requireRole("manager");
  const ids = z.array(z.string().uuid()).min(1).max(500).parse([...new Set(episodeIds)]);
  const op = bulkOperationSchema.parse(operation);
  const validEpisodes = await db
    .select({
      id: units.id,
      orderIndex: units.orderIndex,
      publishingStatus: units.status,
      videoRequiredOverride: units.videoRequiredOverride,
      projectVideoRequired: projects.videoRequired,
      projectKind: projects.kind,
      videoProductionMode: projects.videoProductionMode,
    })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(and(eq(units.projectId, projectId), inArray(units.id, ids)))
    .orderBy(asc(units.orderIndex));
  const validIdSet = new Set(validEpisodes.map((episode) => episode.id));
  const failed: EpisodeBulkResult["failed"] = ids
    .filter((id) => !validIdSet.has(id))
    .map((episodeId) => ({ episodeId, error: "Episode is not in this project." }));
  let succeeded = 0;
  let affectedTaskCount = 0;

  if (op.kind === "owner") await assertAssignable(projectId, op.ownerId);
  if (op.kind === "stage_assignee") {
    await assertAssignable(projectId, op.assigneeId);
  }
  const defaults = op.kind === "assign_defaults" ? await getPodcastStageDefaults(projectId) : null;

  for (let index = 0; index < validEpisodes.length; index += 1) {
    const episode = validEpisodes[index];
    try {
      if (op.kind === "owner") {
        await db.update(units).set({ ownerId: op.ownerId }).where(eq(units.id, episode.id));
      } else if (op.kind === "video") {
        if (episode.projectKind === "video_series") {
          throw new Error("Video is required for every video-series unit.");
        }
        await db
          .update(units)
          .set({ videoRequiredOverride: op.value })
          .where(eq(units.id, episode.id));
        const result = await ensureEpisodeWorkflow(episode.id, actor.id);
        affectedTaskCount += result.createdTaskIds.length;
      } else if (op.kind === "target_date" || op.kind === "date_cadence") {
        const date =
          op.kind === "target_date"
            ? op.date
            : addDays(op.startDate, index * op.intervalDays);
        await ensureEpisodeWorkflow(episode.id, actor.id);
        await db.update(units).set({ scheduledDate: date }).where(eq(units.id, episode.id));
        affectedTaskCount += await rescheduleEpisodeTasks(episode.id, date);
      } else {
        if (
          op.kind === "production_status" &&
          episode.publishingStatus !== "draft"
        ) {
          throw new Error(
            "Scheduled and published episodes keep their historical production state."
          );
        }
        const ensured = await ensureEpisodeWorkflow(episode.id, actor.id);
        affectedTaskCount += ensured.createdTaskIds.length;
        if (op.kind === "production_status") {
          const videoRequired =
            episode.videoRequiredOverride ?? episode.projectVideoRequired;
          const preset = productionStatusTaskPreset(
            op.status,
            workflowProfile({
              kind: episode.projectKind,
              videoProductionMode: episode.videoProductionMode,
              videoRequired,
            })
          );
          if (!preset) {
            throw new Error(
              "This production step requires video, but video is skipped for the episode."
            );
          }
          const changedCounts = await Promise.all(
            Object.entries(preset).map(async ([stage, status]) => {
              const changed = await db
                .update(tasks)
                .set({
                  status,
                  completedAt:
                    status === "done"
                      ? sql`coalesce(${tasks.completedAt}, now())`
                      : null,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(tasks.unitId, episode.id),
                    eq(tasks.podcastStage, stage as PodcastStage)
                  )
                )
                .returning({ id: tasks.id });
              return changed.length;
            })
          );
          affectedTaskCount += changedCounts.reduce(
            (sum, count) => sum + count,
            0
          );
        } else if (op.kind === "stage_assignee") {
          const [task] = await db
            .update(tasks)
            .set({ assignedTo: op.assigneeId, updatedAt: new Date() })
            .where(and(eq(tasks.unitId, episode.id), eq(tasks.podcastStage, op.stage)))
            .returning({ id: tasks.id });
          if (task) {
            affectedTaskCount += 1;
            await notifyAssignment(task.id, op.assigneeId, actor.id);
          }
        } else if (defaults) {
          const profile = workflowProfile({
            kind: episode.projectKind,
            videoProductionMode: episode.videoProductionMode,
            videoRequired:
              episode.videoRequiredOverride ?? episode.projectVideoRequired,
          });
          for (const stage of requiredStages(profile)) {
            if (VIDEO_STAGES.includes(stage)) {
              const [row] = await db
                .select({
                  override: units.videoRequiredOverride,
                  projectDefault: projects.videoRequired,
                })
                .from(units)
                .innerJoin(projects, eq(projects.id, units.projectId))
                .where(eq(units.id, episode.id))
                .limit(1);
              if (!(row?.override ?? row?.projectDefault ?? true)) continue;
            }
            const assigneeId = defaults[stage].assigneeId;
            if (!assigneeId) continue;
            const changed = await db
              .update(tasks)
              .set({ assignedTo: assigneeId, updatedAt: new Date() })
              .where(
                and(
                  eq(tasks.unitId, episode.id),
                  eq(tasks.podcastStage, stage),
                  isNull(tasks.assignedTo)
                )
              )
              .returning({ id: tasks.id });
            for (const task of changed) {
              affectedTaskCount += 1;
              await notifyAssignment(task.id, assigneeId, actor.id);
            }
          }
        }
      }
      succeeded += 1;
    } catch (error) {
      failed.push({
        episodeId: episode.id,
        error: error instanceof Error ? error.message : "Update failed.",
      });
    }
  }
  await revalidateEpisodes(projectId);
  return { succeeded, failed, affectedTaskCount };
}

export async function isEpisodicProject(projectId: string): Promise<boolean> {
  const [project] = await db
    .select({ kind: projects.kind })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return isEpisodicKind(project?.kind);
}
