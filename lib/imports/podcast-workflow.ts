import {
  PODCAST_STAGE_META,
  requiredStages,
  stageDependencies,
  type EpisodicWorkflowProfile,
  type PodcastStage,
} from "@/lib/episodes/workflow";

export type ImportedPodcastEpisode = { id: string; name: string };

export function podcastEpisodesToCreate(
  existingCount: number,
  extractedCount: number | null,
  mode: "total" | "additional"
): number {
  const count = Math.max(0, Math.round(extractedCount ?? 0));
  return mode === "additional" ? count : Math.max(0, count - existingCount);
}

export function importedPodcastTaskRows(
  episodes: ImportedPodcastEpisode[],
  input: {
    projectId: string;
    actorId: string;
    videoRequired: boolean;
    profile?: EpisodicWorkflowProfile;
  }
) {
  const stages = requiredStages(input.profile ?? input.videoRequired);
  return episodes.flatMap((episode) =>
    stages.map((stage) => ({
      projectId: input.projectId,
      unitId: episode.id,
      podcastStage: stage,
      title: `${episode.name}: ${PODCAST_STAGE_META[stage].label}`,
      status: "todo" as const,
      priority: "medium" as const,
      createdBy: input.actorId,
    }))
  );
}

export function importedPodcastDependencyRows(
  tasks: Array<{ id: string; unitId: string | null; stage: PodcastStage | null }>,
  workflow: boolean | EpisodicWorkflowProfile
) {
  const taskByEpisodeAndStage = new Map(
    tasks.map((task) => [`${task.unitId}:${task.stage}`, task.id])
  );
  const episodeIds = [...new Set(tasks.map((task) => task.unitId).filter(Boolean))];
  return episodeIds
    .flatMap((episodeId) =>
      stageDependencies(workflow).map(({ stage, dependsOn }) => ({
        taskId: taskByEpisodeAndStage.get(`${episodeId}:${stage}`),
        dependsOnTaskId: taskByEpisodeAndStage.get(
          `${episodeId}:${dependsOn}`
        ),
      }))
    )
    .filter(
      (edge): edge is { taskId: string; dependsOnTaskId: string } =>
        Boolean(edge.taskId && edge.dependsOnTaskId)
    );
}
