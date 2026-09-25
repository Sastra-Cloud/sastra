/**
 * Idempotently materialize standard production tasks for every podcast episode.
 * Existing matching episode/stage tasks and episode overrides are preserved.
 *
 *   pnpm podcast:backfill
 */
import { asc, eq } from "drizzle-orm";

import { db } from "../lib/db";
import { projects, units } from "../lib/db/schema";
import { ensureEpisodeWorkflow } from "../lib/episodes/workflow-service";

try {
  process.loadEnvFile(".env");
} catch {
  // Rely on the ambient environment in CI/deployment.
}

async function main() {
  const episodes = await db
    .select({ id: units.id })
    .from(units)
    .innerJoin(projects, eq(projects.id, units.projectId))
    .where(eq(projects.kind, "podcast"))
    .orderBy(asc(units.createdAt), asc(units.orderIndex));

  let createdTasks = 0;
  for (const episode of episodes) {
    const result = await ensureEpisodeWorkflow(episode.id, null, {
      notifyAssignments: false,
    });
    createdTasks += result.createdTaskIds.length;
  }
  console.log(
    `Podcast workflow backfill complete: ${episodes.length} episodes checked, ${createdTasks} tasks created.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
