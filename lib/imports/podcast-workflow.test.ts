import { describe, expect, it } from "vitest";

import {
  importedPodcastDependencyRows,
  importedPodcastTaskRows,
  podcastEpisodesToCreate,
} from "./podcast-workflow";

describe("imported podcast workflow materialization", () => {
  it("distinguishes a series total from additional episodes", () => {
    expect(podcastEpisodesToCreate(40, 50, "total")).toBe(10);
    expect(podcastEpisodesToCreate(40, 50, "additional")).toBe(50);
    expect(podcastEpisodesToCreate(60, 50, "total")).toBe(0);
  });

  it("builds all seven tasks and six sequential dependencies for 50 episodes", () => {
    const episodes = Array.from({ length: 50 }, (_, index) => ({
      id: `episode-${index + 1}`,
      name: `Episode ${index + 1}`,
    }));
    const taskRows = importedPodcastTaskRows(episodes, {
      projectId: "podcast-project",
      actorId: "manager",
      videoRequired: true,
    });
    expect(taskRows).toHaveLength(350);
    expect(
      new Set(taskRows.map((task) => `${task.unitId}:${task.podcastStage}`)).size
    ).toBe(350);

    const dependencies = importedPodcastDependencyRows(
      taskRows.map((task, index) => ({
        id: `task-${index + 1}`,
        unitId: task.unitId,
        stage: task.podcastStage,
      })),
      true
    );
    expect(dependencies).toHaveLength(300);

    const firstEpisodeTasks = taskRows
      .map((task, index) => ({ ...task, id: `task-${index + 1}` }))
      .filter((task) => task.unitId === "episode-1");
    const taskIdByStage = new Map(
      firstEpisodeTasks.map((task) => [task.podcastStage, task.id])
    );
    expect(dependencies).toContainEqual({
      taskId: taskIdByStage.get("produce_video"),
      dependsOnTaskId: taskIdByStage.get("master_audio"),
    });
  });

  it("omits video work and schedules after the audio master when video is not granted", () => {
    const taskRows = importedPodcastTaskRows(
      [{ id: "episode-1", name: "Episode 1" }],
      {
        projectId: "podcast-project",
        actorId: "manager",
        videoRequired: false,
      }
    );
    expect(taskRows.map((task) => task.podcastStage)).toEqual([
      "translate_script",
      "approve_translation",
      "record_audio",
      "master_audio",
      "schedule_episode",
    ]);
    const dependencies = importedPodcastDependencyRows(
      taskRows.map((task, index) => ({
        id: `task-${index + 1}`,
        unitId: task.unitId,
        stage: task.podcastStage,
      })),
      false
    );
    const scheduleTask = taskRows.findIndex(
      (task) => task.podcastStage === "schedule_episode"
    );
    const masterTask = taskRows.findIndex(
      (task) => task.podcastStage === "master_audio"
    );
    expect(dependencies).toContainEqual({
      taskId: `task-${scheduleTask + 1}`,
      dependsOnTaskId: `task-${masterTask + 1}`,
    });
  });
});
