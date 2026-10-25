import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { lectioOperations, lectioProjectLinks, projects } from "@/lib/db/schema";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { parseProfile } from "./protocol/profile";
import { IntegrationError, parseSnapshot } from "./protocol/contract";
import { digest } from "./protocol/signing";
import { lectioRequest } from "./client";
import { applySnapshot } from "./projection";
import { lockActiveConnection } from "./guard";
import { resolveProfile } from "./profile";

export async function queueLectioProject(tx: IntegrationTransaction, connectionId: string, projectId: string, reviewBeforeLink = false) {
  const con = await lockActiveConnection(tx, connectionId);
  const profile = parseProfile(con.profile);
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!project || !["book", "article"].includes(project.kind || "book")) throw new IntegrationError("unsupported_project", "Connected creation supports book and article projects.");
  const [existing] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), eq(lectioProjectLinks.state, "linking")));
  if (existing) return existing;
  const projectKey = randomUUID();
  const [link] = await tx.insert(lectioProjectLinks).values({ connectionId, projectId, projectKey, remoteProjectId: `pending-${projectKey}`, deliverFiles: profile.deliverFiles }).returning();
  const body = { projectKey, remoteProjectId: projectId, name: project.title, sourceLanguage: project.sourceLanguage, targetLanguage: project.targetLanguage,
    workflowTemplateId: profile.teamWorkflowId, deliverFiles: profile.deliverFiles, reviewBeforeLink };
  await tx.insert(lectioOperations).values({ connectionId, direction: "out", operationId: `create-${projectKey}`, kind: "create-project",
    fingerprint: digest(JSON.stringify(body)), payload: { body, profile, linkId: link.id, reviewBeforeLink } });
  return link;
}

export async function deliverLectioProject(connection: LectioConnection, operation: typeof lectioOperations.$inferSelect) {
  const ready = await db.transaction(async tx => {
    const con = await lockActiveConnection(tx, connection.id);
    const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, String(operation.payload.linkId))).for("update");
    const [current] = await tx.select().from(lectioOperations).where(eq(lectioOperations.id, operation.id));
    if (current?.state === "done") return null;
    if (!link?.projectId || link.state !== "linking" || current?.state !== "pending") throw new IntegrationError("link_changed", "This project is no longer awaiting creation.", 409);
    return con;
  });
  if (!ready) return;
  const snapshot = parseSnapshot(await lectioRequest(ready, "/api/integrations/sastra/v1/create-project", operation.payload.body, operation.operationId));
  const profile = parseProfile(operation.payload.profile);
  await db.transaction(async tx => {
    const con = await lockActiveConnection(tx, connection.id);
    const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, String(operation.payload.linkId))).for("update");
    if (!link?.projectId || !["active", "linking"].includes(link.state)) throw new IntegrationError("link_changed", "This project was disconnected before creation finished.", 409);
    const [current] = await tx.select().from(lectioOperations).where(eq(lectioOperations.id, operation.id)).for("update");
    if (current.state === "done") return;
    if (current.state !== "pending") throw new IntegrationError("link_changed", "Creation was cancelled.", 409);
    if (operation.payload.reviewBeforeLink === true) {
      await tx.update(lectioProjectLinks).set({ remoteProjectId: snapshot.project.id, lastError: null }).where(eq(lectioProjectLinks.id, link.id));
      await tx.update(lectioOperations).set({ state: "done", result: { reviewRequired: true }, lastError: null }).where(eq(lectioOperations.id, operation.id));
      return;
    }
    const mapping = await resolveProfile(tx, profile, link.projectId, snapshot);
    await tx.update(lectioProjectLinks).set({ remoteProjectId: snapshot.project.id, ...mapping }).where(eq(lectioProjectLinks.id, link.id));
    await applySnapshot(tx, con, snapshot);
    await tx.update(lectioOperations).set({ state: "done", lastError: null }).where(eq(lectioOperations.id, operation.id));
  });
}
