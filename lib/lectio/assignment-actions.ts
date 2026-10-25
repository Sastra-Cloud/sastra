"use server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/guards";
import { requireProjectCapability } from "@/lib/auth/project-access";
import { lectioOperations, lectioProjectLinks, lectioUserLinks, projectMembers, user } from "@/lib/db/schema";
import { lockActiveConnection } from "./guard";
import { IntegrationError, identifier, integer } from "./protocol/contract";
import { digest } from "./protocol/signing";
import { assertVerifiedLectioActor } from "./identity";

export async function requestLectioAssignment(projectId: string, documentId: string, stepKey: string, localAssigneeId: string, expectedVersion: number) {
  const session = await requireUser();
  await requireProjectCapability(projectId, "project.edit");
  try {
    identifier(documentId); identifier(stepKey); identifier(localAssigneeId); integer(expectedVersion, 1);
    const [candidate] = await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), eq(lectioProjectLinks.state, "active")));
    if (!candidate) throw new IntegrationError("link_inactive", "Connect this project before assigning translation work.");
    await db.transaction(async tx => {
      const con = await lockActiveConnection(tx, candidate.connectionId);
      const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, candidate.id)).for("update");
      if (link.state !== "active" || !link.snapshot || link.lastVersion !== expectedVersion) throw new IntegrationError("stale_view", "Translation changed. Sync now and review the assignment again.", 409);
      if (!link.snapshot.documents.some(d => d.id === documentId && d.steps.some(s => s.key === stepKey))) throw new IntegrationError("work_removed", "Choose a current document and step.");
      const people = await tx.select().from(lectioUserLinks).where(and(eq(lectioUserLinks.connectionId, link.connectionId), inArray(lectioUserLinks.userId, [session.user.id, localAssigneeId])));
      const actor = people.find(p => p.userId === session.user.id), assignee = people.find(p => p.userId === localAssigneeId);
      const [member] = await tx.select({ id: user.id }).from(projectMembers).innerJoin(user, and(eq(user.id, projectMembers.userId), eq(user.isActive, true))).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, localAssigneeId)));
      if (!actor || !assignee || !member) throw new IntegrationError("identity_required", "Match both accounts in Settings → Lectio and add the assignee to this Sastra project first.");
      await assertVerifiedLectioActor(tx, con.origin, session.user.id, actor.remoteUserId);
      const body = { projectId: link.remoteProjectId, generation: link.generation, expectedVersion, documentId, stepKey, actorId: actor.remoteUserId, assigneeId: assignee.remoteUserId };
      const fingerprint = digest(JSON.stringify(body));
      const operationId = `assignment-${link.id}-${digest(JSON.stringify([fingerprint, actor.id, assignee.id]))}`;
      const payload = { linkId: link.id, actorMatchId: actor.id, assigneeMatchId: assignee.id, path: "/api/integrations/sastra/v1/assignment", body };
      const [existing] = await tx.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, link.connectionId), eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, operationId)));
      if (!existing) await tx.insert(lectioOperations).values({ connectionId: link.connectionId, direction: "out", kind: "assignment", operationId, fingerprint, payload });
      else if (existing.state === "parked") await tx.update(lectioOperations).set({ state: "pending", attempts: 0, lastError: null, availableAt: new Date(), payload }).where(eq(lectioOperations.id, existing.id));
    });
    revalidatePath("/projects", "layout");
    return { queued: true };
  } catch (error) { return { error: error instanceof IntegrationError ? error.message : "Could not queue this assignment. Your current assignments are unchanged." }; }
}
