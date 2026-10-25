import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { fileAttachments, files, lectioConnections, lectioOperations, lectioProjectLinks, lectioUnitLinks, workspaceSettings } from "@/lib/db/schema";
import { moduleEnabled } from "@/lib/workspace/modules";
import { openSecret } from "@/lib/crypto/secret-box";
import { putObject } from "@/lib/r2";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { IntegrationError, identifier, integer, object, string } from "./protocol/contract";
import { digest, signRequest } from "./protocol/signing";
import { integrationRequest } from "./protocol/transport";

export async function receiveArtifact(tx: IntegrationTransaction, connection: LectioConnection, input: unknown) {
  const body = object(input), projectId = identifier(body.projectId), artifactId = identifier(body.artifactId), documentId = identifier(body.documentId);
  const generation = integer(body.generation, 1), version = integer(body.version, 1), sizeBytes = integer(body.sizeBytes, 1);
  const sha256 = string(body.sha256, 64), name = string(body.name, 500), mimeType = string(body.mimeType, 150);
  if (!/^[a-f0-9]{64}$/.test(sha256) || sizeBytes > 50 * 1024 * 1024 || ![
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.oasis.opendocument.text", "application/x-subrip",
  ].includes(mimeType)) throw new IntegrationError("invalid_file", "Unsupported translated file.");
  const [link] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connection.id), eq(lectioProjectLinks.remoteProjectId, projectId))).for("update");
  if (!link?.projectId || link.state !== "active" || link.generation !== generation || !link.deliverFiles) throw new IntegrationError("files_disabled", "File delivery is not enabled for this project.", 409);
  if (version > link.lastVersion) throw new IntegrationError("snapshot_required", "Synchronize the workflow before delivering its files.", 409);
  const [unit] = await tx.select().from(lectioUnitLinks).where(and(eq(lectioUnitLinks.linkId, link.id), eq(lectioUnitLinks.documentId, documentId), eq(lectioUnitLinks.active, true)));
  if (!unit || !link.snapshot?.documents.some(d => d.id === documentId && d.steps.every(s => s.state === "completed"))) throw new IntegrationError("file_not_ready", "This document is not ready for delivery.", 409);
  const fingerprint = digest(JSON.stringify({ projectId, artifactId, documentId, generation, version, sizeBytes, sha256, name, mimeType }));
  const [existing] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, connection.id),
    eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, `fetch-${artifactId}`)));
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new IntegrationError("artifact_conflict", "This file revision already has different content.", 409);
    return { accepted: true };
  }
  const fileId = randomUUID(), r2Key = `lectio/${connection.id}/${artifactId}`;
  await tx.insert(files).values({ id: fileId, r2Key, originalName: name, mimeType, sizeBytes, status: "pending" });
  await tx.insert(lectioOperations).values({ connectionId: connection.id, operationId: `fetch-${artifactId}`, direction: "out", kind: "artifact-fetch",
    fingerprint, payload: { fileId, artifactId, r2Key, linkId: link.id, documentId, generation, version, sizeBytes, sha256, mimeType } });
  return { accepted: true };
}

export async function fetchArtifact(connection: LectioConnection, operation: typeof lectioOperations.$inferSelect) {
  const p = operation.payload, path = `/api/integrations/sastra/v1/artifact?artifactId=${identifier(p.artifactId)}`;
  const response = await integrationRequest(connection.origin, path, { maxBytes: 50 * 1024 * 1024,
    headers: signRequest({ id: connection.id, epoch: connection.epoch, keyId: connection.outgoingKeyId, secret: openSecret(connection.outgoingSecret) }, "GET", connection.origin + path, "") });
  if ([404, 409, 410].includes(response.status)) throw new IntegrationError("artifact_superseded", "This export is no longer current. Lectio will deliver the next completed revision.", 409);
  if (response.status !== 200) throw new IntegrationError("export_unavailable", "Lectio could not deliver this translated file.", 502);
  if (response.body.length !== p.sizeBytes || digest(response.body) !== p.sha256) throw new IntegrationError("file_integrity", "The translated file failed its integrity check.", 409);
  await putObject(String(p.r2Key), response.body, String(p.mimeType));
  await db.transaction(async tx => {
    const [workspace] = await tx.select().from(workspaceSettings).where(eq(workspaceSettings.id, "workspace")).for("share");
    const [con] = await tx.select().from(lectioConnections).where(eq(lectioConnections.id, connection.id)).for("update");
    if (!workspace || !moduleEnabled(workspace.enabledModules, "lectio") || con?.state !== "active") throw new IntegrationError("connection_inactive", "File delivery is paused.", 409);
    const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, String(p.linkId))).for("update");
    const [current] = await tx.select().from(lectioOperations).where(eq(lectioOperations.id, operation.id)).for("update");
    if (!current || current.state !== "pending") return;
    const [unit] = await tx.select().from(lectioUnitLinks).where(and(eq(lectioUnitLinks.linkId, String(p.linkId)), eq(lectioUnitLinks.documentId, String(p.documentId)), eq(lectioUnitLinks.active, true)));
    if (!link?.projectId || link.state !== "active" || link.generation !== p.generation || !link.deliverFiles || !unit ||
      !link.snapshot?.documents.some(d => d.id === p.documentId && d.steps.every(s => s.state === "completed"))) throw new IntegrationError("link_changed", "This project link changed before file delivery.", 409);
    await tx.update(files).set({ status: "ready" }).where(eq(files.id, String(p.fileId)));
    await tx.insert(fileAttachments).values([
      { fileId: String(p.fileId), targetType: "project", targetId: link.projectId, label: "lectio_translation", notes: `Lectio translation · revision ${p.version}` },
      ...(unit.handoffTaskId ? [{ fileId: String(p.fileId), targetType: "task" as const, targetId: unit.handoffTaskId, label: "lectio_translation", notes: `Lectio translation · revision ${p.version}` }] : []),
    ]);
    await tx.update(lectioOperations).set({ state: "done", lastError: null }).where(eq(lectioOperations.id, operation.id));
  });
}
