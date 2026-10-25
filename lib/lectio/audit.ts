import "server-only";
import { activityLog } from "@/lib/db/schema";
import type { IntegrationTransaction } from "./endpoint";

export async function auditLectio(tx: IntegrationTransaction, connectionId: string, actorId: string | null, action: string, data: Record<string, unknown> = {}) {
  await tx.insert(activityLog).values({ actorId, entityType: "lectio_connection", entityId: connectionId,
    action: `lectio_${action}`, summary: action.replaceAll("_", " "), data });
}
