import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioConnections, lectioPairingIntents } from "@/lib/db/schema";
import { openSecret, sealSecret } from "@/lib/crypto/secret-box";
import { requireWorkspaceModule } from "@/lib/workspace/module-guard";
import { IntegrationError, identifier, object, string } from "./protocol/contract";
import { digest } from "./protocol/signing";
import { integrationJson, integrationOrigin } from "./protocol/transport";
import { lectioRequest } from "./client";
import { assertLectioCloudEligibility } from "./cloud-eligibility";
import { auditLectio } from "./audit";

export async function beginPairing(userId: string, remoteOrigin: string) {
  await assertLectioCloudEligibility();
  const settings = await requireWorkspaceModule("lectio"), origin = integrationOrigin(remoteOrigin);
  const localOrigin = integrationOrigin(process.env.BETTER_AUTH_URL || "http://localhost:3243");
  const state = randomUUID(), verifier = randomBytes(32).toString("base64url");
  await db.insert(lectioPairingIntents).values({ id: state, userId, origin, verifier: sealSecret(verifier), expiresAt: new Date(Date.now() + 10 * 60_000) });
  const url = new URL("/connect/sastra", origin);
  url.searchParams.set("state", state); url.searchParams.set("challenge", digest(verifier));
  url.searchParams.set("origin", localOrigin); url.searchParams.set("workspaceName", settings.orgName || "Sastra workspace");
  return { redirect: url.href };
}

export async function finishPairing(userId: string, state: string, code: string) {
  await assertLectioCloudEligibility();
  await requireWorkspaceModule("lectio");
  const [intent] = await db.select().from(lectioPairingIntents).where(eq(lectioPairingIntents.id, identifier(state)));
  if (!intent || intent.userId !== userId || intent.expiresAt < new Date()) {
    throw new IntegrationError("invalid_pairing", "This connection request expired. Restart setup in Sastra.", 401);
  }
  if (intent.completedAt && intent.connectionId) return intent.connectionId;
  let connectionId = intent.connectionId;
  if (!connectionId) {
    const received = object(await integrationJson(intent.origin, "/api/integrations/sastra/exchange", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, code, verifier: openSecret(intent.verifier) }),
    }));
    const id = identifier(received.id), epoch = identifier(received.epoch), teamId = identifier(received.teamId), teamName = string(received.teamName);
    const incoming = string(received.toSastra, 60), outgoing = string(received.toLectio, 60);
    if (![incoming, outgoing].every(s => /^[A-Za-z0-9_-]{43}$/.test(s))) throw new IntegrationError("invalid_response", "The other app returned invalid credentials.", 502);
    await db.transaction(async tx => {
      await tx.select().from(lectioPairingIntents).where(eq(lectioPairingIntents.id, state)).for("update");
      await tx.insert(lectioConnections).values({ id, epoch, origin: intent.origin, teamId, teamName,
        incomingSecret: sealSecret(incoming), outgoingSecret: sealSecret(outgoing), pairedBy: userId,
        profile: { connectionApproval: { actorId: userId, at: new Date().toISOString() } } }).onConflictDoNothing();
      await tx.update(lectioPairingIntents).set({ connectionId: id }).where(eq(lectioPairingIntents.id, state));
    });
    connectionId = id;
  }
  const [connection] = await db.select().from(lectioConnections).where(eq(lectioConnections.id, connectionId));
  if (!connection || connection.state === "revoked") throw new IntegrationError("connection_revoked", "Restart setup to reconnect.", 409);
  await lectioRequest(connection, "/api/integrations/sastra/v1/confirm", {}, `confirm-${state}`);
  await db.transaction(async tx => {
    const [current] = await tx.select().from(lectioConnections).where(eq(lectioConnections.id, connection.id)).for("update");
    if (!current || !["pending", "active"].includes(current.state)) throw new IntegrationError("connection_changed", "This connection was paused or disconnected during setup.", 409);
    await tx.update(lectioConnections).set({ state: "active", lastSuccessAt: new Date() }).where(eq(lectioConnections.id, connection.id));
    if (current.state === "pending") await auditLectio(tx, current.id, userId, "connection_approved", { origin: current.origin, teamId: current.teamId });
    await tx.update(lectioPairingIntents).set({ completedAt: new Date() }).where(eq(lectioPairingIntents.id, state));
  });
  return connection.id;
}
