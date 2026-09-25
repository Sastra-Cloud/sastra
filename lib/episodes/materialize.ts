import type { db } from "@/lib/db";
import { taskDependencies, tasks, units } from "@/lib/db/schema";
import {
  PODCAST_STAGE_META,
  requiredStages,
  stageDependencies,
  type EpisodicWorkflowProfile,
} from "./workflow";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Transaction-safe unit + standard-task materialization shared by all entry points. */
export async function insertEpisodicUnitsWithWorkflow(
  tx: Tx,
  input: {
    projectId: string;
    actorId: string;
    profile: EpisodicWorkflowProfile;
    unitNames: string[];
    startIndex?: number;
  }
): Promise<void> {
  const startIndex = input.startIndex ?? 0;
  const names = input.unitNames.slice(0, 500);
  if (names.length === 0) return;

  const createdUnits = await tx
    .insert(units)
    .values(
      names.map((name, index) => ({
        projectId: input.projectId,
        name,
        orderIndex: startIndex + index,
        // Podcasts can still override video per episode; video-series units
        // always inherit their project-wide production mode.
        videoRequiredOverride:
          input.profile.kind === "podcast" ? input.profile.videoRequired : null,
      }))
    )
    .returning({ id: units.id, name: units.name });

  const stages = requiredStages(input.profile);
  const createdTasks = await tx
    .insert(tasks)
    .values(
      createdUnits.flatMap((unit) =>
        stages.map((stage) => ({
          projectId: input.projectId,
          unitId: unit.id,
          podcastStage: stage,
          title: `${unit.name}: ${PODCAST_STAGE_META[stage].label}`,
          status: "todo" as const,
          priority: "medium" as const,
          createdBy: input.actorId,
        }))
      )
    )
    .returning({ id: tasks.id, unitId: tasks.unitId, stage: tasks.podcastStage });

  const byUnitAndStage = new Map(
    createdTasks.map((task) => [`${task.unitId}:${task.stage}`, task.id])
  );
  const dependencies = createdUnits.flatMap((unit) =>
    stageDependencies(input.profile).map(({ stage, dependsOn }) => ({
      taskId: byUnitAndStage.get(`${unit.id}:${stage}`)!,
      dependsOnTaskId: byUnitAndStage.get(`${unit.id}:${dependsOn}`)!,
    }))
  );
  if (dependencies.length > 0) {
    await tx.insert(taskDependencies).values(dependencies).onConflictDoNothing();
  }
}
