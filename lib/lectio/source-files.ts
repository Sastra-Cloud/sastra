import "server-only";
import { and, eq } from "drizzle-orm";
import { files, fileAttachments, lectioOperations, lectioProjectLinks } from "@/lib/db/schema";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { getObjectBuffer } from "@/lib/r2";
import { IntegrationError, identifier, object } from "./protocol/contract";
import { digest } from "./protocol/signing";

export async function sourceBytes(tx: IntegrationTransaction, connection: LectioConnection, grantId: string) {
  const [op] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, connection.id), eq(lectioOperations.operationId, identifier(grantId)), eq(lectioOperations.direction, "out"), eq(lectioOperations.kind, "source-file")));
  if (!op || op.state === "parked" || Date.parse(String(op.payload.expiresAt)) <= Date.now()) throw new IntegrationError("grant_expired", "Have the project manager renew this source-file import.", 403);
  const p = op.payload, body = object(p.body);
  const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, String(p.linkId))).for("share");
  if (!link?.projectId || link.state !== "active" || link.generation !== body.generation) throw new IntegrationError("link_inactive", "This source-file grant is no longer active.", 409);
  const [file] = await tx.select({ key: files.r2Key, mime: files.mimeType }).from(files).innerJoin(fileAttachments, eq(fileAttachments.fileId, files.id))
    .where(and(eq(files.id, String(p.fileId)), eq(files.status, "ready"), eq(files.r2Key, String(p.r2Key)), eq(fileAttachments.targetType, "project"), eq(fileAttachments.targetId, link.projectId)));
  if (!file) throw new IntegrationError("file_removed", "This source attachment is no longer shared.", 410);
  const bytes = await getObjectBuffer(file.key, { maxBytes: 50 * 1024 * 1024 });
  if (bytes.length !== body.sizeBytes || digest(bytes) !== body.sha256) throw new IntegrationError("file_changed", "The source file changed after approval.", 409);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": file.mime, "Cache-Control": "private, no-store" } });
}
export async function receiveSourceReceipt(tx: IntegrationTransaction, con: LectioConnection, input: unknown) {
  const b = object(input), grantId = identifier(b.grantId), documentId = identifier(b.documentId);
  const [op] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, con.id), eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, grantId), eq(lectioOperations.kind, "source-file"))).for("update");
  if (!op || op.state === "parked") throw new IntegrationError("grant_removed", "This source import is no longer active.", 409);
  const body = object(op.payload.body);
  if (b.sha256 !== body.sha256) throw new IntegrationError("file_integrity", "The import receipt has a different checksum.", 409);
  await tx.update(lectioOperations).set({ state: "done", result: { status: "imported", documentId }, lastError: null }).where(eq(lectioOperations.id, op.id));
  return { received: true };
}
