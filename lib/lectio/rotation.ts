import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioConnections, lectioOperations } from "@/lib/db/schema";
import { openSecret, sealSecret } from "@/lib/crypto/secret-box";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { IntegrationError, identifier, object, string } from "./protocol/contract";
import { digest } from "./protocol/signing";
import { lectioRequest } from "./client";
import { lockActiveConnection } from "./guard";

export async function receiveKeyRotation(tx: IntegrationTransaction, con: LectioConnection, input: unknown) {
  const body = object(input), keyId = identifier(body.keyId), secret = string(body.secret, 100);
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new IntegrationError("invalid_key", "Invalid connection key.");
  if (keyId === con.incomingKeyId) {
    if (secret !== openSecret(con.incomingSecret)) throw new IntegrationError("key_conflict", "This key identifier already has different content.", 409);
    return { rotated: true };
  }
  if (con.previousIncomingExpiresAt && con.previousIncomingExpiresAt > new Date()) throw new IntegrationError("rotation_pending", "Wait for the previous key rotation window to close.", 409);
  await tx.update(lectioConnections).set({ previousIncomingKeyId: con.incomingKeyId, previousIncomingSecret: con.incomingSecret,
    previousIncomingExpiresAt: new Date(Date.now() + 86400_000), incomingKeyId: keyId, incomingSecret: sealSecret(secret) }).where(eq(lectioConnections.id, con.id));
  return { rotated: true };
}
export async function queueKeyRotation(tx: IntegrationTransaction, con: LectioConnection) {
  const [pending] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, con.id), eq(lectioOperations.kind, "key-rotation"), eq(lectioOperations.state, "pending")));
  if (pending) return;
  const keyId = randomUUID(), secret = randomBytes(32).toString("base64url");
  await tx.insert(lectioOperations).values({ connectionId: con.id, direction: "out", operationId: `rotate-${keyId}`, kind: "key-rotation",
    fingerprint: digest(keyId), payload: { keyId, sealedSecret: sealSecret(secret) } });
}
export async function deliverKeyRotation(connection: LectioConnection, op: typeof lectioOperations.$inferSelect) {
  const con = await db.transaction(async tx => {
    const current = await lockActiveConnection(tx, connection.id);
    const [job] = await tx.select().from(lectioOperations).where(eq(lectioOperations.id, op.id));
    return job?.state === "pending" ? current : null;
  });
  if (!con) return;
  const keyId = identifier(op.payload.keyId), secret = openSecret(String(op.payload.sealedSecret));
  const body = { keyId, secret };
  try { await lectioRequest(con, "/api/integrations/sastra/v1/rotate-key", body, op.operationId); }
  catch (error) {
    // The peer may have committed while its acknowledgement was lost, even past the overlap window.
    if (!(error instanceof IntegrationError) || error.status !== 401) throw error;
    await lectioRequest({ ...con, outgoingKeyId: keyId, outgoingSecret: String(op.payload.sealedSecret) }, "/api/integrations/sastra/v1/rotate-key", body, op.operationId);
  }
  await db.transaction(async tx => {
    await lockActiveConnection(tx, con.id);
    const [current] = await tx.select().from(lectioOperations).where(eq(lectioOperations.id, op.id));
    if (current?.state !== "pending") return;
    await tx.update(lectioConnections).set({ outgoingKeyId: keyId, outgoingSecret: String(op.payload.sealedSecret) }).where(eq(lectioConnections.id, con.id));
    await tx.update(lectioOperations).set({ state: "done", payload: { keyId }, lastError: null }).where(eq(lectioOperations.id, op.id));
  });
}
