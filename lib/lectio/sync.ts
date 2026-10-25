import "server-only";
import { enqueueNotificationEmail } from "@/lib/notifications/email-queue";
import { applySnapshot } from "./projection";
import { queuePlanning } from "./planning";
import { deliverKeyRotation } from "./rotation";
import { lockActiveConnection } from "./guard";
import { fetchArtifact } from "./artifacts";
import { deliverLectioProject } from "./create-project";
import { and, eq, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioConnections, lectioOperations, lectioProjectLinks, lectioRequests, lectioUserLinks, projectManagers, projectMembers, user } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { digest } from "./protocol/signing";
import { IntegrationError } from "./protocol/contract";
import { lectioRequest } from "./client";
import { assertVerifiedLectioActor } from "./identity";
import { can } from "@/lib/auth/policy";
import { settleDisconnect } from "./disconnect-ack";

export async function syncLectioPlanning() {
  const settings = await getWorkspaceSettings();
  if (!moduleEnabled(settings.enabledModules, "lectio")) return { queued: 0, delivered: 0, retrying: 0 };
  const links = await db.select({ link: lectioProjectLinks, connection: lectioConnections }).from(lectioProjectLinks)
    .innerJoin(lectioConnections, eq(lectioConnections.id, lectioProjectLinks.connectionId))
    .where(and(eq(lectioProjectLinks.state, "active"), eq(lectioConnections.state, "active")));
  let queued = 0, delivered = 0, retrying = 0;
  for (const { link: candidate } of links) {
    const added = await db.transaction(async tx => {
      const con = await lockActiveConnection(tx, candidate.connectionId);
      const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, candidate.id)).for("update");
      if (!link?.projectId || link.state !== "active" || !link.snapshot) return false;
      const people = await tx.select({ id: user.id, remoteId: lectioUserLinks.remoteUserId }).from(lectioUserLinks)
        .innerJoin(user, and(eq(user.id, lectioUserLinks.userId), eq(user.isActive, true)))
        .innerJoin(projectMembers, and(eq(projectMembers.userId, user.id), eq(projectMembers.projectId, link.projectId)))
        .where(eq(lectioUserLinks.connectionId, con.id)).orderBy(user.id);
      const identityFingerprint = digest(JSON.stringify(people));
      const [identity] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, con.id), eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, `identity-${link.id}`)));
      if (identity?.fingerprint !== identityFingerprint) {
        await applySnapshot(tx, con, link.snapshot, { mappingReview: true });
        await tx.insert(lectioOperations).values({ connectionId: con.id, direction: "out", operationId: `identity-${link.id}`, kind: "identity-projection", fingerprint: identityFingerprint, payload: {}, state: "done" })
          .onConflictDoUpdate({ target: [lectioOperations.connectionId, lectioOperations.direction, lectioOperations.operationId], set: { fingerprint: identityFingerprint } });
      }
      return queuePlanning(tx, link, settings.timezone);
    });
    if (added) queued++;
  }
  const pending = await db.select({ operation: lectioOperations, connection: lectioConnections }).from(lectioOperations)
    .innerJoin(lectioConnections, eq(lectioConnections.id, lectioOperations.connectionId))
    .where(and(eq(lectioOperations.direction, "out"), eq(lectioOperations.state, "pending"),
      or(eq(lectioConnections.state, "active"), eq(lectioOperations.kind, "lifecycle")), lte(lectioOperations.availableAt, new Date()))).orderBy(lectioOperations.createdAt).limit(20);
  for (const { operation, connection } of pending) {
    try {
      if (operation.kind === "key-rotation") { await deliverKeyRotation(connection, operation); delivered++; continue; }
      if (operation.kind === "create-project") {
        await deliverLectioProject(connection, operation); delivered++; continue;
      }
      if (operation.kind === "artifact-fetch") {
        await fetchArtifact(connection, operation); delivered++; continue;
      }
      if (operation.kind === "notification-email") {
        await enqueueNotificationEmail({ notificationId: String(operation.payload.notificationId), recipientId: String(operation.payload.recipientId), type: String(operation.payload.type) });
        await db.update(lectioOperations).set({ state: "done", lastError: null }).where(eq(lectioOperations.id, operation.id));
        delivered++; continue;
      }
      if (["assignment", "source-file"].includes(operation.kind)) {
        const sent = await db.transaction(async tx => {
          // Keep the connection lock until the peer accepts the command, so a
          // match correction cannot race between authority validation and send.
          const con = await lockActiveConnection(tx, connection.id);
          const [current] = await tx.select().from(lectioOperations).where(eq(lectioOperations.id, operation.id));
          if (current?.state !== "pending") return false;
          const body = current.payload.body as { actorId?: string; assigneeId?: string };
          const matches = await tx.select().from(lectioUserLinks).where(eq(lectioUserLinks.connectionId, con.id));
          const actor = matches.find(match => match.id === current.payload.actorMatchId && match.remoteUserId === body.actorId);
          const assignee = !body.assigneeId || matches.some(match => match.id === current.payload.assigneeMatchId && match.remoteUserId === body.assigneeId);
          if (!actor || !assignee) throw new IntegrationError("identity_changed", "A teammate match changed. Review and request this work again.", 409);
          await assertVerifiedLectioActor(tx, con.origin, actor.userId, actor.remoteUserId);
          const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, String(current.payload.linkId)));
          if (!link?.projectId || link.state !== "active") throw new IntegrationError("identity_changed", "This project was disconnected.", 409);
          const [person] = await tx.select().from(user).where(eq(user.id, actor.userId)).for("share");
          const [grant] = await tx.select().from(projectManagers).where(and(eq(projectManagers.projectId, link.projectId), eq(projectManagers.userId, actor.userId))).for("share");
          if (!person?.isActive || person.isBot || (!can(person.role, "project.edit") && !grant)) throw new IntegrationError("actor_authority_removed", "The requesting person's project permission changed.", 403);
          const path = current.payload.path;
          if (typeof path !== "string" || !path.startsWith("/api/integrations/sastra/v1/")) throw new IntegrationError("invalid_operation", "Invalid stored integration operation.");
          const result = await lectioRequest<Record<string, unknown>>(con, path, current.payload.body, current.operationId);
          await tx.update(lectioOperations).set({ state: "done", result, lastError: null }).where(eq(lectioOperations.id, current.id));
          return true;
        });
        if (sent) delivered++; continue;
      }
      const fresh = operation.kind === "lifecycle" ? connection : await db.transaction(async tx => {
        const con = await lockActiveConnection(tx, connection.id);
        const [current] = await tx.select().from(lectioOperations).where(eq(lectioOperations.id, operation.id));
        if (current?.state !== "pending") return null;
        if (operation.payload.linkId) {
          const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, String(operation.payload.linkId)));
          if (link?.state !== "active") throw new IntegrationError("link_changed", "This project was disconnected.", 409);
        }
        return con;
      });
      if (!fresh) continue;
      const path = operation.payload.path;
      if (typeof path !== "string" || !path.startsWith("/api/integrations/sastra/v1/")) throw new IntegrationError("invalid_operation", "Invalid stored integration operation.");
      const result = await lectioRequest<Record<string, unknown>>(fresh, path, operation.payload.body, operation.operationId);
      await db.transaction(async tx => {
        if (operation.kind === "lifecycle" && path.endsWith("/unlink")) await settleDisconnect(tx, connection.id, operation.payload.body, result);
        await tx.update(lectioOperations).set({ state: "done", result, lastError: null }).where(and(eq(lectioOperations.id, operation.id), eq(lectioOperations.state, "pending")));
      });
      delivered++;
    } catch (error) {
      await db.update(lectioOperations).set({ ...(error instanceof IntegrationError && (["identity_changed", "identity_required", "actor_authority_removed"].includes(error.code) || operation.kind === "artifact-fetch" && error.code === "artifact_superseded") ? { state: "parked" as const } : {}), attempts: sql`${lectioOperations.attempts} + 1`,
        lastError: error instanceof IntegrationError ? error.code : "temporarily_unavailable",
        availableAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(operation.attempts, 7)) * 1000),
      }).where(and(eq(lectioOperations.id, operation.id), eq(lectioOperations.state, "pending")));
      retrying++;
    }
  }
  await db.delete(lectioRequests).where(lt(lectioRequests.createdAt, new Date(Date.now() - 24 * 60 * 60_000)));
  return { queued, delivered, retrying };
}
