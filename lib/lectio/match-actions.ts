"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { lectioOperations, lectioProjectLinks } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/guards";
import { requireProjectCapability } from "@/lib/auth/project-access";
import { lockActiveConnection } from "./guard";
import { lectioRequest } from "./client";
import { queueLectioProject } from "./create-project";
import { requestScheduledTick } from "@/lib/hosted/tick-request";
import { IntegrationError } from "./protocol/contract";
import { rankProjectMatches, type ProjectCandidate, type ProjectMatchInput } from "./protocol/project-matches";
import { parseProfile } from "./protocol/profile";

export async function findLectioProjectMatches(connectionId: string, input: ProjectMatchInput, localProjectId?: string) {
  if (localProjectId) await requireProjectCapability(localProjectId, "project.edit"); else await requireRole("manager");
  try {
    const connection = await db.transaction(tx => lockActiveConnection(tx, connectionId));
    const query = new URLSearchParams({ matches: "1", name: input.name });
    if (localProjectId) query.set("sourceProjectId", localProjectId);
    const result = await lectioRequest<{ projects: ProjectCandidate[]; allowCreate?: boolean }>(connection, `/api/integrations/sastra/v1/projects?${query}`);
    const links = await db.select({ remoteId: lectioProjectLinks.remoteProjectId, projectId: lectioProjectLinks.projectId }).from(lectioProjectLinks)
      .where(and(eq(lectioProjectLinks.connectionId, connectionId), inArray(lectioProjectLinks.state, ["active", "linking"])));
    const [previous] = localProjectId ? await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connectionId), eq(lectioProjectLinks.projectId, localProjectId), eq(lectioProjectLinks.state, "unlinked"))).limit(1) : [];
    if (previous) {
      const [withdrawal] = await db.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, connectionId), eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, `unlink-${previous.id}-${previous.generation}`)));
      if (previous.remoteProjectId.startsWith("pending-") || withdrawal?.state === "pending") throw new IntegrationError("disconnect_pending", "Disconnection is still reaching Lectio. Retry shortly to review the project pair.", 409);
    }
    let defaultsApproved = false;
    try { parseProfile(connection.profile); defaultsApproved = true; } catch { /* Existing-project review remains available. */ }
    return { projects: rankProjectMatches(result.projects.filter(project => (!previous || project.id === previous.remoteProjectId) && !links.some(link => link.remoteId === project.id && link.projectId !== localProjectId)), input), teamName: connection.teamName, allowNew: !previous && defaultsApproved && result.allowCreate === true };
  } catch (error) { return { error: error instanceof IntegrationError ? error.message : "Could not check Lectio projects. Retry before choosing how to connect." }; }
}

export async function createLectioProjectForReview(projectId: string, connectionId: string) {
  await requireProjectCapability(projectId, "project.edit");
  try {
    const matches = await findLectioProjectMatches(connectionId, { name: "", sourceLanguage: "", targetLanguage: "" }, projectId);
    if ("error" in matches) return { error: matches.error };
    if (!matches.allowNew) throw new IntegrationError("creation_not_approved", "Both administrators must approve new counterpart creation in the connection settings first.", 403);
    await db.transaction(async tx => {
      await lockActiveConnection(tx, connectionId);
      const [existing] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), inArray(lectioProjectLinks.state, ["active", "linking", "unlinked"])));
      if (existing) throw new IntegrationError("already_linked", "Review the existing or previous project pair instead of creating another project.", 409);
      await queueLectioProject(tx, connectionId, projectId, true);
    });
    revalidatePath("/projects", "layout"); requestScheduledTick(); return { queued: true };
  } catch (error) { return { error: error instanceof IntegrationError ? error.message : "Could not start the connection. Your project is unchanged." }; }
}
