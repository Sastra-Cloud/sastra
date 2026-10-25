"use server";

import { queueKeyRotation } from "./rotation";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth/guards";
import { requireProjectCapability } from "@/lib/auth/project-access";
import { lectioConnections, lectioOperations, lectioProjectLinks, lectioSsoIdentities, lectioTaskLinks, lectioUserLinks, phases, phaseTemplates, planTemplates, projects, tasks, user } from "@/lib/db/schema";
import { requireWorkspaceModule } from "@/lib/workspace/module-guard";
import { IntegrationError, identifier, parseSnapshot, type StageMapping } from "./protocol/contract";
import { lectioRequest } from "./client";
import { adoptExistingUnits } from "./adoption";
import { applySnapshot } from "./projection";
import { mappedPhases } from "./mapping";
import { detachProject, queueLifecycle, revokeConnection } from "./lifecycle";
import { parseProfile } from "./protocol/profile";
import { validateProfile } from "./profile";
import { digest } from "./protocol/signing";
import { deliverLectioProject } from "./create-project";
import { lockActiveConnection } from "./guard";
import { lockTaskQueues, touchTaskQueue } from "@/lib/tasks/queue-service";
import { auditLectio } from "./audit";
import { requestScheduledTick } from "@/lib/hosted/tick-request";

async function connection(id: string) {
  await requireWorkspaceModule("lectio");
  const [row] = await db.select().from(lectioConnections).where(eq(lectioConnections.id, identifier(id)));
  if (!row || row.state !== "active") throw new IntegrationError("connection_inactive", "Connect or resume this Lectio team first.", 409);
  return row;
}
function message(error: unknown) { return error instanceof IntegrationError ? error.message : "The integration could not finish. Your existing work is preserved; please retry."; }

export async function listLectioSetup(connectionId: string) {
  await requireRole("admin");
  try {
    const con = await connection(connectionId);
    const [remote, templates, stages] = await Promise.all([
      lectioRequest<{ templates: { id: string; name: string; isDefault: boolean; steps: { key: string; name: string }[] }[] }>(con, "/api/integrations/sastra/v1/templates"),
      db.select({ id: planTemplates.id, name: planTemplates.name }).from(planTemplates).where(eq(planTemplates.isActive, true)),
      db.select({ id: phaseTemplates.id, templateId: phaseTemplates.planTemplateId, name: phaseTemplates.name }).from(phaseTemplates).orderBy(phaseTemplates.orderIndex),
    ]);
    return { remote: remote.templates, templates, stages, profile: con.profile, autoCreate: con.autoCreate };
  } catch (error) { return { error: message(error) }; }
}

export async function saveLectioSetup(connectionId: string, input: unknown, autoCreate: boolean) {
  await requireRole("admin");
  try {
    const con = await connection(connectionId), requested = parseProfile(input);
    const { templates } = await lectioRequest<{ templates: { id: string; steps: { key: string }[] }[] }>(con, "/api/integrations/sastra/v1/templates");
    const template = templates.find(t => t.id === requested.teamWorkflowId);
    if (!template) throw new IntegrationError("template_unavailable", "Choose a workflow from this Lectio team.");
    await db.transaction(async tx => {
      const current = await lockActiveConnection(tx, con.id);
      if (current?.state !== "active") throw new IntegrationError("connection_inactive", "Resume this connection before updating its defaults.");
      const profile = { ...requested, version: Number(current.profile.version || 0) + 1 };
      await validateProfile(tx, profile, template.steps.map(s => s.key));
      await tx.update(lectioConnections).set({ profile: { ...current.profile, ...profile }, autoCreate: autoCreate === true }).where(eq(lectioConnections.id, con.id));
      await tx.insert(lectioOperations).values({ connectionId: con.id, direction: "out", operationId: `profile-${profile.version}`, kind: "profile",
        fingerprint: digest(JSON.stringify(profile)), payload: { path: "/api/integrations/sastra/v1/profile", body: { profile } } });
    });
    revalidatePath("/settings/lectio");
    return { saved: true };
  } catch (error) { return { error: message(error) }; }
}

export async function listLectioPeople(connectionId: string) {
  await requireRole("admin");
  try {
    const con = await connection(connectionId);
    const [remote, local, linked] = await Promise.all([
      lectioRequest<{ people: { id: string; name: string; email: string }[] }>(con, "/api/integrations/sastra/v1/people"),
      db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(and(eq(user.isActive, true), eq(user.isBot, false))),
      db.select({ remoteId: lectioUserLinks.remoteUserId, localId: lectioUserLinks.userId }).from(lectioUserLinks).where(eq(lectioUserLinks.connectionId, con.id)),
    ]);
    if (!Array.isArray(remote.people) || remote.people.some(person => typeof person.email !== "string" || !person.email)) throw new IntegrationError("peer_update_required", "Update Lectio before reviewing teammate matches.", 409);
    return { remote: remote.people, local, linked };
  } catch (error) { return { error: message(error) }; }
}
export async function confirmLectioPerson(connectionId: string, remoteId: string, localId: string) {
  const session = await requireRole("admin");
  try {
    const con = await connection(connectionId);
    const remote = await lectioRequest<{ people: { id: string; name: string; email: string }[] }>(con, "/api/integrations/sastra/v1/people");
    const person = remote.people.find(p => p.id === identifier(remoteId));
    const [local] = await db.select({ id: user.id }).from(user).where(and(eq(user.id, identifier(localId)), eq(user.isActive, true), eq(user.isBot, false)));
    if (!person || !person.email || !local) throw new IntegrationError("person_unavailable", "Choose a current teammate with a visible account email in each app.");
    await db.transaction(async tx => {
      const current = await lockActiveConnection(tx, con.id);
      const identities = await tx.select().from(lectioSsoIdentities).where(eq(lectioSsoIdentities.issuer, `${current.origin}/api/auth`));
      if (identities.some(identity => (identity.userId === local.id && identity.subject !== person.id) || (identity.subject === person.id && identity.userId !== local.id))) throw new IntegrationError("identity_conflict", "This account has a different verified sign-in link. Its owner must unlink shared sign-in in Profile first.", 409);
      const existing = await tx.select().from(lectioUserLinks).where(eq(lectioUserLinks.connectionId, con.id));
      if (existing.some(match => (match.userId === local.id || match.remoteUserId === person.id) && !(match.userId === local.id && match.remoteUserId === person.id))) throw new IntegrationError("match_changed", "An account is already matched. Remove the old match and review both people first.", 409);
      if (existing.some(match => match.userId === local.id && match.remoteUserId === person.id)) return;
      await tx.insert(lectioUserLinks).values({ connectionId: con.id, userId: local.id, remoteUserId: person.id,
        remoteName: person.name, confirmedBy: session.user.id });
      await auditLectio(tx, con.id, session.user.id, "person_matched", { remoteUserId: person.id, userId: local.id });
      const links = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, con.id), eq(lectioProjectLinks.state, "active"))).for("update");
      for (const link of links) if (link.snapshot) await applySnapshot(tx, current, link.snapshot, { mappingReview: true });
    });
    revalidatePath("/settings/lectio");
    return { saved: true };
  } catch (error) { return { error: message(error) }; }
}

export async function removeLectioPerson(connectionId: string, remoteId: string, expectedLocalId: string) {
  const session = await requireRole("admin");
  try {
    identifier(remoteId); identifier(expectedLocalId);
    await db.transaction(async tx => {
      const con = await lockActiveConnection(tx, identifier(connectionId), true);
      const [match] = await tx.select().from(lectioUserLinks).where(and(eq(lectioUserLinks.connectionId, con.id), eq(lectioUserLinks.remoteUserId, remoteId))).for("update");
      if (!match || match.userId !== expectedLocalId) throw new IntegrationError("match_changed", "This match changed. Reload teammates before removing it.", 409);
      const [verified] = await tx.select().from(lectioSsoIdentities).where(and(eq(lectioSsoIdentities.issuer, `${con.origin}/api/auth`), eq(lectioSsoIdentities.subject, remoteId)));
      if (verified) throw new IntegrationError("verified_identity", "This person must unlink shared sign-in in Profile before you can change their teammate match.", 409);
      await tx.delete(lectioUserLinks).where(eq(lectioUserLinks.id, match.id));
      await tx.update(lectioOperations).set({ state: "parked", lastError: "person_match_removed" }).where(and(eq(lectioOperations.connectionId, con.id), eq(lectioOperations.direction, "out"), or(eq(lectioOperations.state, "pending"), eq(lectioOperations.kind, "source-file")),
        sql`(${lectioOperations.payload}->'body'->>'actorId' = ${remoteId} OR ${lectioOperations.payload}->'body'->>'assigneeId' = ${remoteId})`));
      const links = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, con.id), eq(lectioProjectLinks.state, "active"))).for("update");
      for (const link of links) if (link.snapshot) await applySnapshot(tx, con, link.snapshot, { mappingReview: true });
      await auditLectio(tx, con.id, session.user.id, "person_match_removed", { remoteUserId: remoteId, userId: match.userId, matchId: match.id });
    });
    revalidatePath("/", "layout"); return { saved: true };
  } catch (error) { return { error: message(error) }; }
}

export async function listLectioProjects(projectId: string, connectionId: string) {
  await requireProjectCapability(projectId, "project.edit");
  try { return await lectioRequest<{ projects: { id: string; name: string | null; sourceLanguage: string; targetLanguage: string }[] }>(
    await connection(connectionId), "/api/integrations/sastra/v1/projects"); }
  catch (error) { return { error: message(error) }; }
}
export async function previewLectioProject(projectId: string, connectionId: string, remoteProjectId: string) {
  await requireProjectCapability(projectId, "project.edit");
  try { return { snapshot: parseSnapshot(await lectioRequest(await connection(connectionId),
    `/api/integrations/sastra/v1/preview?projectId=${identifier(remoteProjectId)}`)) }; }
  catch (error) { return { error: message(error) }; }
}
export async function linkLectioProject(projectId: string, connectionId: string, remoteProjectId: string, mapping: StageMapping[], handoffPhaseId: string | null = null, deliverFiles = false, adoptions: { documentId: string; unitId: string }[] = []) {
  await requireProjectCapability(projectId, "project.edit");
  try {
    const con = await connection(connectionId);
    const snapshot = parseSnapshot(await lectioRequest(con, `/api/integrations/sastra/v1/preview?projectId=${identifier(remoteProjectId)}`));
    const groups = mappedPhases(mapping, snapshot.steps.map(s => s.key));
    const localPhases = await db.select().from(phases).where(eq(phases.projectId, projectId));
    if ([...groups.keys()].some(id => !localPhases.some(p => p.id === id))) throw new IntegrationError("invalid_mapping", "Choose phases from this Sastra project.");
    if (handoffPhaseId) {
      const handoff = localPhases.find(p => p.id === handoffPhaseId);
      const lastMapped = Math.max(...localPhases.filter(p => groups.has(p.id)).map(p => p.orderIndex));
      if (!handoff || handoff.orderIndex <= lastMapped) throw new IntegrationError("invalid_handoff", "Choose a publishing phase after the mapped translation phases.");
    }
    const link = await db.transaction(async tx => {
      await lockActiveConnection(tx, con.id);
      const [active] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), inArray(lectioProjectLinks.state, ["active", "linking"]))).for("update");
      const [historical] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, con.id), eq(lectioProjectLinks.remoteProjectId, remoteProjectId))).for("update");
      const existing = active || historical;
      if (existing) {
        if (existing.connectionId !== con.id || existing.remoteProjectId !== remoteProjectId || existing.projectId !== projectId || !["linking", "unlinked"].includes(existing.state)) {
          throw new IntegrationError("already_linked", "This project already has a link. Review it before connecting another project.", 409);
        }
        const [updated] = await tx.update(lectioProjectLinks).set({ stageMap: mapping, handoffPhaseId, deliverFiles: deliverFiles === true, ...(existing.state === "unlinked" ? { state: "linking" as const, generation: existing.generation + 1, lastVersion: 0, snapshot: null } : {}) }).where(eq(lectioProjectLinks.id, existing.id)).returning();
        await adoptExistingUnits(tx, { id: updated.id, projectId, handoffPhaseId }, snapshot, mapping, adoptions);
        return updated;
      }
      const [created] = await tx.insert(lectioProjectLinks).values({ connectionId: con.id, projectId, remoteProjectId,
        projectKey: randomUUID(), stageMap: mapping, handoffPhaseId, deliverFiles: deliverFiles === true }).returning();
      await adoptExistingUnits(tx, { id: created.id, projectId, handoffPhaseId }, snapshot, mapping, adoptions);
      return created;
    });
    if (link.generation > 1 && link.lastVersion === 0) await lectioRequest(con, "/api/integrations/sastra/v1/unlink",
      { projectId: remoteProjectId, projectKey: link.projectKey, generation: link.generation - 1 }, `unlink-${link.id}-${link.generation - 1}`);
    const authoritative = await lectioRequest(con, "/api/integrations/sastra/v1/link", {
      projectId: remoteProjectId, remoteProjectId: projectId, projectKey: link.projectKey, generation: link.generation, deliverFiles: link.deliverFiles,
    }, `link-${link.id}-${link.generation}`);
    await db.transaction(async tx => {
      const current = await lockActiveConnection(tx, con.id);
      if (current?.state !== "active") throw new IntegrationError("connection_inactive", "This connection was paused.", 409);
      await applySnapshot(tx, current, authoritative);
    });
    revalidatePath("/projects");
    return { linked: true };
  } catch (error) { return { error: message(error) }; }
}
export async function refreshLectioProject(projectId: string) {
  await requireProjectCapability(projectId, "project.edit");
  try {
    const [link] = await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), inArray(lectioProjectLinks.state, ["active", "linking"])));
    if (!link) throw new IntegrationError("not_found", "Connect a Lectio project first.");
    const con = await connection(link.connectionId);
    if (link.remoteProjectId.startsWith("pending-")) {
      const [operation] = await db.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, con.id), eq(lectioOperations.operationId, `create-${link.projectKey}`), eq(lectioOperations.direction, "out")));
      if (!operation || operation.state === "parked") throw new IntegrationError("creation_unavailable", "This project creation needs administrator review.", 409);
      await deliverLectioProject(con, operation);
      revalidatePath("/projects");
      return { synced: true, prepared: operation.payload.reviewBeforeLink === true };
    }
    if (link.state === "linking" && !link.stageMap.length) throw new IntegrationError("mapping_review_required", "Finish reviewing workflow mapping before synchronizing this project.", 409);
    if (link.state === "linking" && link.generation > 1 && link.lastVersion === 0) await lectioRequest(con, "/api/integrations/sastra/v1/unlink",
      { projectId: link.remoteProjectId, projectKey: link.projectKey, generation: link.generation - 1 }, `unlink-${link.id}-${link.generation - 1}`);
    const snapshot = link.state === "linking"
      ? await lectioRequest(con, "/api/integrations/sastra/v1/link", { projectId: link.remoteProjectId, remoteProjectId: projectId, projectKey: link.projectKey, generation: link.generation, deliverFiles: link.deliverFiles }, `link-${link.id}-${link.generation}`)
      : await lectioRequest(con, `/api/integrations/sastra/v1/snapshot?projectId=${identifier(link.remoteProjectId)}`);
    await db.transaction(async tx => {
      const current = await lockActiveConnection(tx, con.id);
      if (current?.state !== "active") throw new IntegrationError("connection_inactive", "This connection was paused.", 409);
      await applySnapshot(tx, current, snapshot);
    });
    revalidatePath("/projects");
    return { synced: true };
  } catch (error) { return { error: message(error) }; }
}
export async function setLectioConnectionState(connectionId: string, state: "paused" | "active" | "revoked") {
  const { user: actor } = await requireRole("admin");
  if (!["paused", "active", "revoked"].includes(state)) return { error: "Invalid connection state." };
  await requireWorkspaceModule("lectio");
  const changed = await db.transaction(async tx => {
    const [con] = await tx.select().from(lectioConnections).where(eq(lectioConnections.id, identifier(connectionId))).for("update");
    if (!con || !(state === "revoked" ? ["pending", "active", "paused"] : ["active", "paused"]).includes(con.state)) return false;
    if (state === "revoked") {
      await revokeConnection(tx, con.id);
      await queueLifecycle(tx, con.id, `revoke-${con.id}`, "revoke", {});
    } else {
      await tx.update(lectioConnections).set({ state }).where(eq(lectioConnections.id, con.id));
    }
    await auditLectio(tx, con.id, actor.id, "connection_state_changed", { previous: con.state, next: state });
    return true;
  });
  if (!changed) return { error: "This connection changed. Refresh before trying again." };
  revalidatePath("/settings/lectio");
  revalidatePath("/projects");
  return { saved: true };
}

export async function disconnectLectioProject(projectId: string, expected?: { id: string; generation: number }) {
  const { user: actor } = await requireProjectCapability(projectId, "project.edit");
  await requireWorkspaceModule("lectio");
  try {
    const [candidate] = await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), inArray(lectioProjectLinks.state, ["active", "linking", "removed"])));
    if (!candidate) throw new IntegrationError("not_linked", "This project is already disconnected.");
    if (expected && (expected.id !== candidate.id || expected.generation !== candidate.generation)) throw new IntegrationError("link_changed", "This project connection changed. Reload before disconnecting.", 409);
    await db.transaction(async tx => {
      await tx.select().from(lectioConnections).where(eq(lectioConnections.id, candidate.connectionId)).for("update");
      const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, candidate.id)).for("update");
      if (!link || link.generation !== candidate.generation || link.state === "unlinked") throw new IntegrationError("link_changed", "This project connection changed. Reload before disconnecting.", 409);
      await detachProject(tx, link.id);
      await queueLifecycle(tx, link.connectionId, `unlink-${link.id}-${link.generation}`, "unlink", { projectId: link.remoteProjectId, projectKey: link.projectKey, generation: link.generation });
      await auditLectio(tx, link.connectionId, actor.id, "project_disconnected", { projectId, remoteProjectId: link.remoteProjectId, generation: link.generation });
    });
    revalidatePath("/projects");
    return { saved: true };
  } catch (error) { return { error: message(error) }; }
}

export async function previewLectioMapping(projectId: string) {
  await requireProjectCapability(projectId, "project.edit");
  try {
    const [link] = await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), inArray(lectioProjectLinks.state, ["active", "linking"])));
    if (!link) throw new IntegrationError("not_linked", "Connect this project first.");
    const snapshot = parseSnapshot(await lectioRequest(await connection(link.connectionId), `/api/integrations/sastra/v1/snapshot?projectId=${identifier(link.remoteProjectId)}`));
    return { snapshot, mapping: link.stageMap };
  } catch (error) { return { error: message(error) }; }
}

export async function updateLectioMapping(projectId: string, mapping: StageMapping[], expectedVersion: number) {
  await requireProjectCapability(projectId, "project.edit");
  try {
    const [candidate] = await db.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.projectId, projectId), inArray(lectioProjectLinks.state, ["active", "linking"])));
    if (!candidate) throw new IntegrationError("not_linked", "Connect this project first.");
    const con = await connection(candidate.connectionId);
    const snapshot = parseSnapshot(await lectioRequest(con, `/api/integrations/sastra/v1/snapshot?projectId=${identifier(candidate.remoteProjectId)}`));
    if (snapshot.version !== expectedVersion) throw new IntegrationError("concurrent_change", "Lectio changed after this preview. Review the latest workflow before saving.", 409);
    const approvalBody = { projectId: candidate.remoteProjectId, remoteProjectId: projectId, projectKey: candidate.projectKey,
      generation: candidate.generation, deliverFiles: candidate.deliverFiles };
    const approvalId = `link-${candidate.id}-${candidate.generation}`;
    await db.transaction(async tx => {
      const current = await lockActiveConnection(tx, con.id);
      if (current?.state !== "active") throw new IntegrationError("connection_inactive", "This connection was paused.", 409);
      const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, candidate.id)).for("update");
      if (!link || link.generation !== candidate.generation || !["active", "linking"].includes(link.state) || link.lastVersion > expectedVersion) throw new IntegrationError("concurrent_change", "The project changed. Review it again.", 409);
      await tx.update(lectioProjectLinks).set({ stageMap: mapping }).where(eq(lectioProjectLinks.id, candidate.id));
      await applySnapshot(tx, current, snapshot, { mappingReview: true });
      if (candidate.state === "linking") await tx.insert(lectioOperations).values({ connectionId: con.id, direction: "out", kind: "mapping-approval", operationId: approvalId,
        fingerprint: digest(JSON.stringify(approvalBody)), payload: { linkId: candidate.id, path: "/api/integrations/sastra/v1/link", body: approvalBody } }).onConflictDoNothing();
    });
    if (candidate.state === "linking") {
      requestScheduledTick();
      await lectioRequest(con, "/api/integrations/sastra/v1/link", approvalBody, approvalId);
      await db.update(lectioOperations).set({ state: "done", lastError: null }).where(and(eq(lectioOperations.connectionId, con.id), eq(lectioOperations.direction, "out"), eq(lectioOperations.operationId, approvalId), eq(lectioOperations.state, "pending")));
    }
    revalidatePath("/projects");
    return { saved: true };
  } catch (error) { return { error: message(error) }; }
}
export async function resolveLectioReopen(projectId: string, taskId: string, decision: "reopen" | "keep", expectedVersion: number) {
  await requireProjectCapability(projectId, "project.edit");
  if (!["reopen", "keep"].includes(decision)) return { error: "Choose a reopen decision." };
  await requireWorkspaceModule("lectio");
  const session = await getSession();
  try {
    const [candidate] = await db.select({ link: lectioProjectLinks }).from(lectioTaskLinks)
      .innerJoin(lectioProjectLinks, eq(lectioProjectLinks.id, lectioTaskLinks.linkId))
      .where(and(eq(lectioTaskLinks.taskId, taskId), eq(lectioProjectLinks.projectId, projectId)));
    if (!candidate) throw new IntegrationError("not_found", "Task not found.");
    const con = await connection(candidate.link.connectionId);
    const latest = parseSnapshot(await lectioRequest(con, `/api/integrations/sastra/v1/snapshot?projectId=${identifier(candidate.link.remoteProjectId)}`));
    if (latest.version !== expectedVersion) throw new IntegrationError("concurrent_change", "Lectio changed. Synchronize and review the task again.", 409);
    await db.transaction(async tx => {
      await lockActiveConnection(tx, con.id);
      const [link] = await tx.select().from(lectioProjectLinks).where(eq(lectioProjectLinks.id, candidate.link.id)).for("update");
      if (link?.state !== "active" || link.generation !== candidate.link.generation || link.lastVersion !== expectedVersion || link.requestedVersion > expectedVersion) throw new IntegrationError("concurrent_change", "The translation changed. Synchronize and review again.", 409);
      const [before] = await tx.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)));
      if (!before) throw new IntegrationError("not_found", "Task not found.");
      await lockTaskQueues(tx, [before.assignedTo]);
      const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
      if (task.assignedTo !== before.assignedTo) throw new IntegrationError("concurrent_change", "The task changed. Retry.");
      const [binding] = await tx.select().from(lectioTaskLinks).where(eq(lectioTaskLinks.taskId, taskId)).for("update");
      if (!binding?.reopenPending) throw new IntegrationError("already_resolved", "This reopen has already been reviewed.");
      if (decision === "reopen") {
        const state = binding.observedState === "todo" ? "todo" : "in_progress";
        await tx.update(tasks).set({ status: state, completedAt: null, updatedAt: new Date() }).where(eq(tasks.id, taskId));
        await touchTaskQueue(tx, task.assignedTo, session!.user.id);
      }
      await tx.update(lectioTaskLinks).set({ reopenPending: false, retainedCycle: decision === "keep" ? "keep" : null }).where(eq(lectioTaskLinks.taskId, taskId));
    });
    const [project] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, projectId));
    revalidatePath(`/projects/${project.slug}`);
    return { saved: true };
  } catch (error) { return { error: message(error) }; }
}

export async function rotateLectioConnectionKeys(connectionId: string) {
  await requireRole("admin");
  try {
    await db.transaction(async tx => {
      const con = await lockActiveConnection(tx, identifier(connectionId));
      await queueKeyRotation(tx, con);
      const id = randomUUID();
      await tx.insert(lectioOperations).values({ connectionId: con.id, direction: "out", operationId: `peer-rotation-${id}`, kind: "peer-rotation", fingerprint: digest(id), payload: { path: "/api/integrations/sastra/v1/rotate-peer-key", body: {} } });
    });
    revalidatePath("/settings/lectio");
    return { queued: true };
  } catch (error) { return { error: message(error) }; }
}
