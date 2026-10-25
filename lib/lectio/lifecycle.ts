import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { lectioConnections, lectioOperations, lectioProjectLinks, lectioTaskLinks, lectioUnitLinks, tasks } from "@/lib/db/schema";
import type { IntegrationTransaction } from "./endpoint";
import { digest } from "./protocol/signing";

/** Keep publishing history and release local task ownership on an explicit disconnect. */
export async function detachProject(tx: IntegrationTransaction, linkId: string) {
  const bindings = await tx.select({ id: lectioTaskLinks.taskId }).from(lectioTaskLinks).where(eq(lectioTaskLinks.linkId, linkId));
  if (bindings.length) await tx.update(tasks).set({ lectioManaged: false }).where(inArray(tasks.id, bindings.map(b => b.id)));
  await tx.update(lectioTaskLinks).set({ active: false, reopenPending: false }).where(eq(lectioTaskLinks.linkId, linkId));
  await tx.update(lectioUnitLinks).set({ active: false }).where(eq(lectioUnitLinks.linkId, linkId));
  await tx.update(lectioProjectLinks).set({ state: "unlinked" }).where(eq(lectioProjectLinks.id, linkId));
  // A project creation or file fetch may already be awaiting retry.
  await tx.update(lectioOperations).set({ state: "parked", lastError: "project_disconnected" }).where(and(
    eq(lectioOperations.direction, "out"), eq(lectioOperations.state, "pending"), inArray(lectioOperations.kind, ["create-project", "mapping-approval", "artifact-fetch", "assignment", "source-file"]), sql`${lectioOperations.payload}->>'linkId' = ${linkId}`));
}

export async function revokeConnection(tx: IntegrationTransaction, connectionId: string) {
  await tx.update(lectioConnections).set({ state: "revoked", autoCreate: false }).where(eq(lectioConnections.id, connectionId));
  const links = await tx.select({ id: lectioProjectLinks.id }).from(lectioProjectLinks).where(eq(lectioProjectLinks.connectionId, connectionId)).for("update");
  for (const link of links) await detachProject(tx, link.id);
  // Do not deliver old planning, files or work alerts after consent is withdrawn.
  await tx.update(lectioOperations).set({ state: "parked", lastError: "connection_revoked" }).where(and(
    eq(lectioOperations.connectionId, connectionId), eq(lectioOperations.direction, "out"), eq(lectioOperations.state, "pending")));
}

export async function queueLifecycle(tx: IntegrationTransaction, connectionId: string, operationId: string, operation: "unlink" | "revoke", body: Record<string, unknown>) {
  await tx.insert(lectioOperations).values({ connectionId, direction: "out", operationId, kind: "lifecycle",
    fingerprint: digest(JSON.stringify(body)), payload: { path: `/api/integrations/sastra/v1/${operation}`, body } }).onConflictDoNothing();
}
