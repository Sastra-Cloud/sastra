import "server-only";

import { and, asc, eq, isNotNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  projectMembers,
  projects,
  taskDependencies,
  tasks,
  units,
  user,
} from "@/lib/db/schema";
import { getPodcastStageDefaults } from "./workflow-service";
import {
  AUDIO_STAGES,
  deriveEpisodeProductionStatus,
  PODCAST_STAGES,
  requiredStages,
  trackProgress,
  TRANSLATION_STAGES,
  ORIGINAL_VIDEO_EDITORIAL_STAGES,
  VIDEO_STAGES,
  workflowProfile,
  type EpisodicWorkflowProfile,
  type EpisodeProductionStatus,
  type PodcastStage,
  type PodcastTaskStatus,
} from "./workflow";

export const EPISODE_MILESTONES = [52, 104] as const;
export const PAYMENT_EPISODE_MILESTONE = 52;

export async function publishedEpisodeCount(projectId: string): Promise<number> {
  const rows = await db
    .select({ id: units.id })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(
      and(
        eq(units.projectId, projectId),
        eq(projects.kind, "podcast"),
        eq(units.status, "published")
      )
    );
  return rows.length;
}

export type EpisodeStageTask = {
  id: string;
  stage: PodcastStage;
  title: string;
  status: PodcastTaskStatus;
  assignedTo: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  dueDateIsManual: boolean;
  blocked: boolean;
};

export type EpisodeProductionRow = {
  id: string;
  name: string;
  orderIndex: number;
  publishingStatus: "draft" | "scheduled" | "published";
  productionStatus: EpisodeProductionStatus;
  scheduledDate: string | null;
  publishedDate: string | null;
  externalUrl: string | null;
  ownerId: string | null;
  ownerName: string | null;
  videoRequiredOverride: boolean | null;
  videoRequired: boolean;
  translationProgress: ReturnType<typeof trackProgress>;
  audioProgress: ReturnType<typeof trackProgress> | null;
  videoProgress: ReturnType<typeof trackProgress> | null;
  overdueCount: number;
  blockedCount: number;
  unassignedCount: number;
  workflowComplete: boolean;
  missingStageCount: number;
  tasks: EpisodeStageTask[];
};

export type EpisodeData = {
  episodes: EpisodeProductionRow[];
  total: number;
  publishedCount: number;
  scheduledCount: number;
  draftCount: number;
  setupNeededCount: number;
  notStartedCount: number;
  inProductionCount: number;
  translatingCount: number;
  readyCount: number;
  overdueCount: number;
  unassignedCount: number;
  milestones: { n: number; reached: boolean }[];
  projectVideoRequired: boolean;
  projectKind: "podcast" | "video_series";
  videoProductionMode: "original" | "translation" | null;
  workflowProfile: EpisodicWorkflowProfile;
  workflowStages: PodcastStage[];
  editorialLabel: "Original script" | "Translation";
  stageDefaults: Awaited<ReturnType<typeof getPodcastStageDefaults>>;
  assignableUsers: { id: string; name: string }[];
};

/** Episodes with derived production rollups and their standard stage tasks. */
export async function getEpisodeData(projectId: string): Promise<EpisodeData> {
  const [project, episodeRows, stageRows, dependencyRows, stageDefaults, memberRows] =
    await Promise.all([
      db
        .select({
          videoRequired: projects.videoRequired,
          kind: projects.kind,
          videoProductionMode: projects.videoProductionMode,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({
          id: units.id,
          name: units.name,
          orderIndex: units.orderIndex,
          status: units.status,
          scheduledDate: units.scheduledDate,
          publishedDate: units.publishedDate,
          externalUrl: units.externalUrl,
          ownerId: units.ownerId,
          ownerName: user.name,
          videoRequiredOverride: units.videoRequiredOverride,
        })
        .from(units)
        .leftJoin(user, eq(user.id, units.ownerId))
        .where(eq(units.projectId, projectId))
        .orderBy(asc(units.orderIndex)),
      db
        .select({
          id: tasks.id,
          unitId: tasks.unitId,
          stage: tasks.podcastStage,
          title: tasks.title,
          status: tasks.status,
          assignedTo: tasks.assignedTo,
          assigneeName: user.name,
          dueDate: tasks.dueDate,
          dueDateIsManual: tasks.dueDateIsManual,
        })
        .from(tasks)
        .leftJoin(user, eq(user.id, tasks.assignedTo))
        .where(
          and(eq(tasks.projectId, projectId), isNotNull(tasks.podcastStage))
        ),
      db
        .select({
          taskId: taskDependencies.taskId,
          dependsOnTaskId: taskDependencies.dependsOnTaskId,
        })
        .from(taskDependencies)
        .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
        .where(eq(tasks.projectId, projectId)),
      getPodcastStageDefaults(projectId),
      db
        .selectDistinct({ id: user.id, name: user.name })
        .from(projectMembers)
        .innerJoin(user, eq(user.id, projectMembers.userId))
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            eq(user.isActive, true),
            eq(user.isBot, false)
          )
        )
        .orderBy(asc(user.name)),
    ]);

  const projectVideoRequired = project?.videoRequired ?? true;
  const projectKind = project?.kind === "video_series" ? "video_series" : "podcast";
  const projectProfile = workflowProfile({
    kind: projectKind,
    videoProductionMode: project?.videoProductionMode,
    videoRequired: projectVideoRequired,
  });
  const taskById = new Map(stageRows.map((task) => [task.id, task]));
  const dependencyIds = new Map<string, string[]>();
  for (const edge of dependencyRows) {
    const current = dependencyIds.get(edge.taskId) ?? [];
    current.push(edge.dependsOnTaskId);
    dependencyIds.set(edge.taskId, current);
  }
  const today = new Date().toISOString().slice(0, 10);

  const episodes = episodeRows.map((episode): EpisodeProductionRow => {
    const videoRequired =
      projectKind === "video_series"
        ? true
        : episode.videoRequiredOverride ?? projectVideoRequired;
    const profile = workflowProfile({
      kind: projectKind,
      videoProductionMode: project?.videoProductionMode,
      videoRequired,
    });
    const episodeTasks: EpisodeStageTask[] = stageRows
      .filter(
        (task): task is typeof task & { unitId: string; stage: PodcastStage } =>
          task.unitId === episode.id &&
          task.stage != null &&
          PODCAST_STAGES.includes(task.stage)
      )
      .map((task) => ({
        id: task.id,
        stage: task.stage,
        title: task.title,
        status: task.status,
        assignedTo: task.assignedTo,
        assigneeName: task.assigneeName,
        dueDate: task.dueDate,
        dueDateIsManual: task.dueDateIsManual,
        blocked: (dependencyIds.get(task.id) ?? []).some(
          (dependencyId) => taskById.get(dependencyId)?.status !== "done"
        ),
      }));
    const statuses = Object.fromEntries(
      episodeTasks.map((task) => [task.stage, task.status])
    ) as Partial<Record<PodcastStage, PodcastTaskStatus>>;
    const presentStages = new Set(episodeTasks.map((task) => task.stage));
    const missingStageCount = requiredStages(profile).filter(
      (stage) => !presentStages.has(stage)
    ).length;
    const workflowComplete = missingStageCount === 0;
    const relevantTasks = episodeTasks.filter(
      (task) => videoRequired || !VIDEO_STAGES.includes(task.stage)
    );
    return {
      ...episode,
      publishingStatus: episode.status,
      productionStatus: deriveEpisodeProductionStatus({
        publishingStatus: episode.status,
        videoRequired,
        workflowProfile: profile,
        statuses,
        workflowComplete,
      }),
      videoRequired,
      translationProgress: trackProgress(
        statuses,
        profile.kind === "video_series" && profile.videoProductionMode === "original"
          ? ORIGINAL_VIDEO_EDITORIAL_STAGES
          : TRANSLATION_STAGES
      ),
      audioProgress:
        profile.kind === "podcast" ? trackProgress(statuses, AUDIO_STAGES) : null,
      videoProgress: videoRequired ? trackProgress(statuses, VIDEO_STAGES) : null,
      overdueCount: relevantTasks.filter(
        (task) =>
          task.status !== "done" && task.dueDate != null && task.dueDate < today
      ).length,
      blockedCount: relevantTasks.filter(
        (task) => task.status !== "done" && task.blocked
      ).length,
      unassignedCount:
        (episode.ownerId ? 0 : 1) +
        missingStageCount +
        relevantTasks.filter(
          (task) => task.status !== "done" && !task.assignedTo
        ).length,
      workflowComplete,
      missingStageCount,
      tasks: episodeTasks,
    };
  });

  const publishedCount = episodes.filter(
    (episode) => episode.publishingStatus === "published"
  ).length;
  const scheduledCount = episodes.filter(
    (episode) => episode.publishingStatus === "scheduled"
  ).length;

  return {
    episodes,
    total: episodes.length,
    publishedCount,
    scheduledCount,
    draftCount: episodes.length - publishedCount - scheduledCount,
    setupNeededCount: episodes.filter((episode) => !episode.workflowComplete)
      .length,
    notStartedCount: episodes.filter(
      (episode) => episode.productionStatus === "Not started"
    ).length,
    inProductionCount: episodes.filter(
      (episode) =>
        ![
          "Setup incomplete",
          "Not started",
          "Ready to schedule",
          "Scheduled",
          "Published",
        ].includes(episode.productionStatus)
    ).length,
    translatingCount: episodes.filter((episode) =>
      ["Translating", "Reviewing translation"].includes(
        episode.productionStatus
      )
    ).length,
    readyCount: episodes.filter(
      (episode) => episode.productionStatus === "Ready to schedule"
    ).length,
    overdueCount: episodes.filter((episode) => episode.overdueCount > 0).length,
    unassignedCount: episodes.filter((episode) => episode.unassignedCount > 0)
      .length,
    milestones:
      projectKind === "podcast"
        ? EPISODE_MILESTONES.map((n) => ({ n, reached: publishedCount >= n }))
        : [],
    projectVideoRequired,
    projectKind,
    videoProductionMode: projectProfile.videoProductionMode ?? null,
    workflowProfile: projectProfile,
    workflowStages: requiredStages(projectProfile),
    editorialLabel:
      projectKind === "video_series" && projectProfile.videoProductionMode === "original"
        ? "Original script"
        : "Translation",
    stageDefaults,
    assignableUsers: memberRows,
  };
}
