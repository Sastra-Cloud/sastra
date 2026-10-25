"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { requireProjectCapability } from "@/lib/auth/project-access";
import { fileAttachments, files, lectioOperations, lectioProjectLinks, lectioUserLinks } from "@/lib/db/schema";
import { getObjectBuffer } from "@/lib/r2";
import { lockActiveConnection } from "./guard";
import { IntegrationError, identifier } from "./protocol/contract";
import { digest } from "./protocol/signing";
import { assertVerifiedLectioActor } from "./identity";

export async function requestLectioSourceImport(projectId: string, fileId: string) {
  const session = await requireUser();
  await requireProjectCapability(projectId, "project.edit");
  try {
    identifier(fileId);
    const [candidate] = await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), eq(lectioProjectLinks.state, "active")));
    if (!candidate) throw new IntegrationError("link_inactive", "Connect this project before sharing source files.");
    const [file] = await db.select({ file: files }).from(files).innerJoin(fileAttachments, eq(fileAttachments.fileId, files.id))
      .where(and(eq(files.id, fileId), eq(files.status, "ready"), eq(fileAttachments.targetType, "project"), eq(fileAttachments.targetId, projectId)));
    if (!file || !/\.(docx|odt|idml)$/i.test(file.file.originalName) || file.file.sizeBytes > 50 * 1024 * 1024) throw new IntegrationError("unsupported_file", "Choose a DOCX, ODT, or IDML project attachment up to 50 MB.");
    const bytes = await getObjectBuffer(file.file.r2Key, { maxBytes: 50 * 1024 * 1024 });
    if (bytes.length !== file.file.sizeBytes || !bytes.length) throw new IntegrationError("file_changed", "This attachment changed. Upload it again before importing.");
    const sha256 = digest(bytes);
    await db.transaction(async tx => {
      const con = await lockActiveConnection(tx, candidate.connectionId);
      const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, candidate.id)).for("update");
      const [actor] = await tx.select().from(lectioUserLinks).where(and(eq(lectioUserLinks.connectionId, link.connectionId), eq(lectioUserLinks.userId, session.user.id)));
      const [attachment] = await tx.select({ id: files.id }).from(files).innerJoin(fileAttachments, eq(fileAttachments.fileId, files.id))
        .where(and(eq(files.id, fileId), eq(files.r2Key, file.file.r2Key), eq(files.status, "ready"), eq(fileAttachments.targetType, "project"), eq(fileAttachments.targetId, projectId)));
      if (link.state !== "active" || !attachment) throw new IntegrationError("source_changed", "The connection or attachment changed. Refresh before importing.");
      if (!actor) throw new IntegrationError("identity_required", "Match your Lectio account in Settings → Lectio before sharing files.");
      await assertVerifiedLectioActor(tx, con.origin, session.user.id, actor.remoteUserId);
      const grantId = `source-${link.id}-${link.generation}-${digest(JSON.stringify([fileId, sha256, actor.id]))}`;
      const body = { projectId: link.remoteProjectId, generation: link.generation, grantId, sourceFileId: fileId, sha256, sizeBytes: bytes.length, name: file.file.originalName, actorId: actor.remoteUserId };
      const payload = { linkId: link.id, actorMatchId: actor.id, fileId, r2Key: file.file.r2Key, expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(), path: "/api/integrations/sastra/v1/source-file", body };
      const [existing] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, link.connectionId), eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, grantId)));
      if (!existing) await tx.insert(lectioOperations).values({ connectionId: link.connectionId, direction: "out", operationId: grantId, kind: "source-file", fingerprint: digest(JSON.stringify(body)), payload });
      else {
        if (existing.fingerprint !== digest(JSON.stringify(body))) throw new IntegrationError("source_changed", "This source request changed. Review the attachment before sharing it again.", 409);
        await tx.update(lectioOperations).set({ payload, availableAt: new Date(), ...(existing.state === "parked" ? { state: "pending" as const, attempts: 0, lastError: null } : {}) }).where(eq(lectioOperations.id, existing.id));
      }
    });
    revalidatePath("/projects", "layout");
    return { queued: true };
  } catch (error) { return { error: error instanceof IntegrationError ? error.message : "Could not share this file. The original attachment is unchanged." }; }
}
