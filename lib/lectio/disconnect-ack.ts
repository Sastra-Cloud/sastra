import "server-only";
import { and, eq } from "drizzle-orm";
import { lectioConnections, lectioProjectLinks } from "@/lib/db/schema";
import type { IntegrationTransaction } from "./endpoint";
import { identifier, object } from "./protocol/contract";

/** Resolve creation/cancellation races before allowing another counterpart to be created. */
export async function settleDisconnect(tx: IntegrationTransaction, connectionId: string, input: unknown, result: Record<string, unknown>) {
  const body = object(input);
  if (typeof body.projectKey !== "string") return;
  await tx.select().from(lectioConnections).where(eq(lectioConnections.id, connectionId)).for("update");
  const [link] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connectionId), eq(lectioProjectLinks.projectKey, body.projectKey))).for("update");
  if (!link || link.state !== "unlinked" || link.generation !== body.generation || !link.remoteProjectId.startsWith("pending-")) return;
  if (typeof result.counterpartProjectId === "string") {
    await tx.update(lectioProjectLinks).set({ remoteProjectId: identifier(result.counterpartProjectId) }).where(eq(lectioProjectLinks.id, link.id));
  } else if (result.creationCancelled === true && link.lastVersion === 0 && !link.snapshot && !link.stageMap.length) {
    // This empty intent has no projected work. The peer retained a cancellation
    // tombstone, so an in-flight old create can never create a second project.
    await tx.delete(lectioProjectLinks).where(eq(lectioProjectLinks.id, link.id));
  }
}
