import { receiveKeyRotation } from "@/lib/lectio/rotation";
import { projectMatches } from "@/lib/lectio/project-matches";
import { readSchedule, updateSchedule } from "@/lib/lectio/planning";
import { requestScheduledTick } from "@/lib/hosted/tick-request";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { lectioOperations, lectioProjectLinks } from "@/lib/db/schema";
import { signedEndpoint } from "@/lib/lectio/endpoint";
import { receiveArtifact } from "@/lib/lectio/artifacts";
import { applySnapshot } from "@/lib/lectio/projection";
import { detachProject, revokeConnection } from "@/lib/lectio/lifecycle";
import { sourceBytes, receiveSourceReceipt } from "@/lib/lectio/source-files";
import { receiveProject } from "@/lib/lectio/receive-project";
import { IntegrationError, object, identifier, integer } from "@/lib/lectio/protocol/contract";
type Context = { params: Promise<{ operation: string }> };
export async function POST(request: Request, { params }: Context) {
  const { operation } = await params;
  const response = await signedEndpoint(request, async (tx, connection, body) => {
    if (operation === "project-matches") return projectMatches(tx, connection, body);
    if (operation === "schedule") return readSchedule(tx, connection, body);
    if (operation === "update-schedule") return updateSchedule(tx, connection, body);
    if (operation === "rotate-key") return receiveKeyRotation(tx, connection, body);
    if (operation === "source-receipt") return receiveSourceReceipt(tx, connection, body);
    if (operation === "create-project") return receiveProject(tx, connection, body);
    if (operation === "revoke") {
      await revokeConnection(tx, connection.id);
      return { revoked: true };
    }
    if (operation === "unlink") {
      const data = object(body), projectId = identifier(data.projectId), generation = integer(data.generation, 1);
      const [link] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connection.id), eq(lectioProjectLinks.remoteProjectId, projectId))).for("update");
      if (!link && data.projectKey && generation === 1) {
        const key = identifier(data.projectKey);
        await tx.insert(lectioOperations).values({ connectionId: connection.id, direction: "in", operationId: `cancel-create-${key}`, kind: "cancel-create", fingerprint: key, payload: {}, result: { cancelled: true }, state: "done" }).onConflictDoNothing();
        return { unlinked: true, creationCancelled: true };
      }
      if (link && data.projectKey && data.projectKey !== link.projectKey) throw new IntegrationError("link_changed", "This project identity changed.", 409);
      if (link && generation < link.generation) return { unlinked: true };
      if (!link || link.generation !== generation) throw new IntegrationError("link_changed", "This project link has changed.", 409);
      await detachProject(tx, link.id);
      return { unlinked: true, counterpartProjectId: link.projectId };
    }
    if (operation === "snapshot") return applySnapshot(tx, connection, body);
    if (operation === "artifact") return receiveArtifact(tx, connection, body);
    if (operation === "removed") {
      const data = object(body), projectId = identifier(data.projectId), generation = integer(data.generation, 1), version = integer(data.version, 1);
      const [link] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connection.id), eq(lectioProjectLinks.remoteProjectId, projectId))).for("update");
      if (!link || link.generation !== generation || link.state === "unlinked") throw new IntegrationError("link_inactive", "This link is no longer active.", 409);
      if (version <= link.lastVersion) return { appliedVersion: link.lastVersion };
      await detachProject(tx, link.id);
      await tx.update(lectioProjectLinks).set({ state: "removed", lastVersion: version, lastAppliedAt: new Date() }).where(eq(lectioProjectLinks.id, link.id));
      return { appliedVersion: version };
    }
    throw new IntegrationError("not_found", "Unknown integration operation.", 404);
  }, false, operation === "revoke" || operation === "unlink");
  if (response.ok && operation === "update-schedule") {
    revalidatePath("/projects", "layout");
    requestScheduledTick();
  }
  return response;
}

export async function GET(request: Request, { params }: Context) {
  const { operation } = await params;
  return signedEndpoint(request, async (tx, connection) => {
    if (operation !== "source") throw new IntegrationError("not_found", "Unknown integration operation.", 404);
    return sourceBytes(tx, connection, identifier(new URL(request.url).searchParams.get("grantId")));
  });
}
