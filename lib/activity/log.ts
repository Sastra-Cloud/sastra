import "server-only";

import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { logger } from "@/lib/logger";

/**
 * Record an audit-trail entry. Best-effort: a logging failure must never break
 * the mutation it accompanies, so errors are swallowed (and logged to console).
 */
export async function logActivity(entry: {
  actorId: string | null;
  projectId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  summary: string;
  data?: unknown;
}): Promise<void> {
  try {
    await db.insert(activityLog).values({
      actorId: entry.actorId ?? null,
      projectId: entry.projectId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      action: entry.action,
      summary: entry.summary,
      data: (entry.data ?? null) as Record<string, unknown> | null,
    });
  } catch (err) {
    logger.error("logActivity failed", err);
  }
}
