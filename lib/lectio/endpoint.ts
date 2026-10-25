import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioConnections, lectioOperations, lectioRequests, workspaceSettings } from "@/lib/db/schema";
import { openSecret } from "@/lib/crypto/secret-box";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { IntegrationError, SNAPSHOT_LIMIT, identifier } from "./protocol/contract";
import { errorResponse, readLimitedBody, verifyRequest } from "./protocol/signing";
import { assertLectioCloudEligibility } from "./cloud-eligibility";
export type IntegrationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type LectioConnection = typeof lectioConnections.$inferSelect;

export async function signedEndpoint(request: Request, handler: (
  tx: IntegrationTransaction, connection: LectioConnection, body: unknown,
) => Promise<Record<string, unknown> | Response>, allowPending = false, allowDisconnect = false) {
  try {
    await assertLectioCloudEligibility();
    if (!moduleEnabled((await getWorkspaceSettings()).enabledModules, "lectio")) {
      throw new IntegrationError("module_disabled", "The Lectio module is disabled.", 403);
    }
    const id = identifier(request.headers.get("x-sastra-connection"));
    const bytes = await readLimitedBody(request, SNAPSHOT_LIMIT);
    const result = await db.transaction(async tx => {
      const [workspace] = await tx.select({ enabledModules: workspaceSettings.enabledModules }).from(workspaceSettings).where(eq(workspaceSettings.id, "workspace")).for("share");
      if (!workspace || !moduleEnabled(workspace.enabledModules, "lectio")) throw new IntegrationError("module_disabled", "The Lectio module is disabled.", 403);
      const [connection] = await tx.select().from(lectioConnections).where(eq(lectioConnections.id, id)).for("update");
      if (!connection || !(connection.state === "active" || (allowPending && connection.state === "pending") || (allowDisconnect && ["pending", "paused", "revoked"].includes(connection.state)))) {
        throw new IntegrationError("connection_inactive", "This connection is not active.", 401);
      }
      const previous = request.headers.get("x-sastra-key-id") === connection.previousIncomingKeyId &&
        connection.previousIncomingExpiresAt && connection.previousIncomingExpiresAt > new Date();
      const verified = verifyRequest({ id, epoch: connection.epoch,
        keyId: previous ? connection.previousIncomingKeyId! : connection.incomingKeyId,
        secret: openSecret(previous ? connection.previousIncomingSecret! : connection.incomingSecret) }, request, bytes);
      const attempt = await tx.insert(lectioRequests).values({ connectionId: id, requestId: verified.requestId }).onConflictDoNothing().returning();
      if (!attempt.length) throw new IntegrationError("replayed_request", "Sign a new request before retrying.", 409);
      if (verified.operationId) {
        const [existing] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, id),
          eq(lectioOperations.direction, "in"), eq(lectioOperations.operationId, verified.operationId)));
        if (existing) {
          if (existing.fingerprint !== verified.fingerprint) throw new IntegrationError("idempotency_conflict", "This operation ID already has different content.", 409);
          return existing.result;
        }
      }
      let body: unknown = null;
      try { if (bytes.length) body = JSON.parse(Buffer.from(bytes).toString("utf8")); }
      catch { throw new IntegrationError("invalid_payload", "Expected JSON."); }
      const result = await handler(tx, connection, body);
      if (verified.operationId) await tx.insert(lectioOperations).values({
        connectionId: id, direction: "in", operationId: verified.operationId, kind: new URL(request.url).pathname,
        fingerprint: verified.fingerprint, payload: {}, result: result as Record<string, unknown>, state: "done",
      });
      return result;
    });
    if (request.method === "GET" && result instanceof Response) return result;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
