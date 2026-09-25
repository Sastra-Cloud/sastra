import "server-only";

import type { Db } from "@/lib/db";
import { emailThreadProjects } from "@/lib/db/schema";

/** The transaction handle drizzle passes to db.transaction(...). */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Upsert the many-to-many link between a thread and a project. Idempotent (safe
 * to call whenever `emailThreads.projectId` is set), so the join table stays a
 * complete source of truth for "every thread for a project". Pass a transaction
 * to run it inside one. Every writer that sets `emailThreads.projectId` must also
 * call this so `listThreads({projectId})` (a plain inner join) never misses a
 * linked thread.
 */
export async function ensureThreadProjectLink(
  exec: Db | Tx,
  threadId: string,
  projectId: string,
  opts: { linkedManually?: boolean } = {}
): Promise<void> {
  await exec
    .insert(emailThreadProjects)
    .values({
      threadId,
      projectId,
      linkedManually: opts.linkedManually ?? false,
    })
    .onConflictDoNothing({
      target: [emailThreadProjects.threadId, emailThreadProjects.projectId],
    });
}
