import "server-only";
import { handoffTranslation } from "./handoff";
import { mappedPhases } from "./mapping";
import { and, eq, inArray, sql } from "drizzle-orm";
import { activityLog, lectioProjectLinks, lectioTaskLinks, lectioUnitLinks, lectioUserLinks,
  phases, projectMembers, projects, tasks, units, user, workspaceSettings } from "@/lib/db/schema";
import { insertTaskInTransaction } from "@/lib/tasks/create";
import { lockTaskQueues, nextTaskRank, touchTaskQueue } from "@/lib/tasks/queue-service";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { IntegrationError, parseSnapshot, projectTaskState } from "./protocol/contract";


/** A source version and every resulting task/unit write commit together. No network effects here. */
export async function applySnapshot(tx: IntegrationTransaction, connection: LectioConnection, input: unknown, options: { mappingReview?: boolean } = {}) {
  const snapshot = parseSnapshot(input);
  if (snapshot.connectionId !== connection.id || snapshot.epoch !== connection.epoch) {
    throw new IntegrationError("wrong_connection", "This snapshot belongs to another connection.", 409);
  }
  const [link] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connection.id),
    eq(lectioProjectLinks.remoteProjectId, snapshot.project.id))).for("update");
  if (!link?.projectId || !["active", "linking"].includes(link.state) || link.generation !== snapshot.generation) {
    throw new IntegrationError("link_inactive", "This project link is no longer active.", 409);
  }
  if (snapshot.version < link.lastVersion && options.mappingReview) throw new IntegrationError("concurrent_change", "Translation changed during review. Reload the workflow and retry.", 409);
  if (snapshot.version <= link.lastVersion && !options.mappingReview) return { appliedVersion: link.lastVersion };
  const groups = mappedPhases(link.stageMap, snapshot.steps.map(s => s.key));
  const localPhases = await tx.select().from(phases).where(eq(phases.projectId, link.projectId));
  if ([...groups.keys()].some(id => !localPhases.some(p => p.id === id))) {
    throw new IntegrationError("mapping_review_required", "A mapped Sastra phase was removed. Review the mapping.", 409);
  }
  const people = await tx.select({ remoteId: lectioUserLinks.remoteUserId, localId: user.id }).from(lectioUserLinks)
    .innerJoin(user, and(eq(user.id, lectioUserLinks.userId), eq(user.isActive, true)))
    .where(and(eq(lectioUserLinks.connectionId, connection.id), sql`exists (
      select 1 from ${projectMembers} where ${projectMembers.userId} = ${user.id} and ${projectMembers.projectId} = ${link.projectId}
    )`));
  const members = await tx.select({ roleId: projectMembers.projectRoleId, userId: user.id }).from(projectMembers)
    .innerJoin(user, and(eq(user.id, projectMembers.userId), eq(user.isActive, true))).where(eq(projectMembers.projectId, link.projectId));
  const localTasks = await tx.select({ id: tasks.id, assignedTo: tasks.assignedTo }).from(tasks).where(eq(tasks.projectId, link.projectId));
  const [project] = await tx.select({ slug: projects.slug }).from(projects).where(eq(projects.id, link.projectId));
  const [settings] = await tx.select({ timezone: workspaceSettings.timezone }).from(workspaceSettings).where(eq(workspaceSettings.id, "workspace"));
  const handoffPhase = localPhases.find(p => p.id === link.handoffPhaseId);
  if (handoffPhase && handoffPhase.orderIndex <= Math.max(...localPhases.filter(p => groups.has(p.id)).map(p => p.orderIndex))) {
    throw new IntegrationError("invalid_handoff", "Keep the next publishing stage after every mapped translation phase.", 409);
  }
  const oldBindings = await tx.select({ binding: lectioTaskLinks, task: tasks }).from(lectioTaskLinks)
    .innerJoin(tasks, eq(tasks.id, lectioTaskLinks.taskId)).where(eq(lectioTaskLinks.linkId, link.id));
  // Queue locks always precede task row locks, matching normal Sastra task writes.
  await lockTaskQueues(tx, [...people.map(p => p.localId), ...oldBindings.map(b => b.task.assignedTo), ...localTasks.map(t => t.assignedTo), ...members.map(m => m.userId)]);
  const unitBindings = await tx.select().from(lectioUnitLinks).where(eq(lectioUnitLinks.linkId, link.id));
  const seenTasks: string[] = [], seenUnits: string[] = [];
  const baseline = link.lastVersion === 0 || options.mappingReview === true;
  for (const document of snapshot.documents) {
    const existingUnit = unitBindings.find(b => b.documentId === document.id);
    let unitId = existingUnit?.unitId;
    let handoffTaskId = existingUnit?.handoffTaskId;
    if (!unitId) {
      const [unit] = await tx.insert(units).values({ projectId: link.projectId, name: document.name, orderIndex: document.order }).returning();
      unitId = unit.id;
      if (handoffPhase) {
        const task = await insertTaskInTransaction(tx, { projectId: link.projectId, unitId, phaseId: handoffPhase.id,
          title: `${document.name} · ${handoffPhase.name}` }, null);
        handoffTaskId = task.id;
      }
      await tx.insert(lectioUnitLinks).values({ linkId: link.id, documentId: document.id, unitId, handoffTaskId });
    } else {
      await tx.update(units).set({ name: document.name, orderIndex: document.order }).where(eq(units.id, unitId));
      await tx.update(lectioUnitLinks).set({ active: true }).where(eq(lectioUnitLinks.unitId, unitId));
    }
    if (handoffPhase && !handoffTaskId) {
      const handoff = await insertTaskInTransaction(tx, { projectId: link.projectId, unitId, phaseId: handoffPhase.id,
        title: `${document.name} · ${handoffPhase.name}` }, null);
      handoffTaskId = handoff.id;
      await tx.update(lectioUnitLinks).set({ handoffTaskId }).where(and(eq(lectioUnitLinks.linkId, link.id), eq(lectioUnitLinks.documentId, document.id)));
    }
    seenUnits.push(unitId);
    for (const [phaseId, keys] of groups) {
      const source = document.steps.filter(s => keys.includes(s.key));
      const status = projectTaskState(source);
      const assignees = [...new Set(source.flatMap(s => s.assigneeIds))];
      // Do not invent a primary owner for multi-assignee work or match people by email.
      const assignedTo = assignees.length === 1 ? people.find(p => p.remoteId === assignees[0])?.localId ?? null : null;
      const completion = status === "done" ? new Date(Math.max(...source.map(s => Date.parse(s.completedAt!)))) : null;
      const prior = oldBindings.find(b => b.binding.documentId === document.id && b.task.phaseId === phaseId);
      let taskId: string;
      if (!prior) {
        const created = await insertTaskInTransaction(tx, { lectioManaged: true, projectId: link.projectId, unitId, phaseId,
          title: `${document.name} · ${localPhases.find(p => p.id === phaseId)!.name}`, status, assignedTo }, null);
        taskId = created.id;
        await tx.update(tasks).set({ completedAt: completion }).where(eq(tasks.id, taskId));
        await tx.insert(lectioTaskLinks).values({ taskId, linkId: link.id, documentId: document.id, stepKeys: keys, observedState: status });
      } else {
        taskId = prior.task.id;
        const [current] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
        if (current.assignedTo !== prior.task.assignedTo) throw new IntegrationError("concurrent_change", "An assignment changed. Retry synchronization.", 409);
        // A source reopen requires an explicit PM decision; downstream work may already have started.
        const reopenPending = current.status === "done" && status !== "done" && prior.binding.retainedCycle !== "keep";
        await tx.update(lectioTaskLinks).set({ stepKeys: keys, observedState: status, reopenPending, retainedCycle: status === "done" ? null : prior.binding.retainedCycle, active: true }).where(eq(lectioTaskLinks.taskId, taskId));
        const nextStatus = current.status === "done" && status !== "done" ? "done" : status;
        const changed = !current.lectioManaged || current.status !== nextStatus || current.assignedTo !== assignedTo;
        if (changed) {
          await tx.update(tasks).set({ lectioManaged: true, status: nextStatus, assignedTo,
            completedAt: nextStatus === "done" && status !== "done" ? current.completedAt : completion,
            isNextUp: nextStatus === "done" || current.assignedTo !== assignedTo ? false : current.isNextUp,
            rank: current.assignedTo !== assignedTo ? await nextTaskRank(tx, assignedTo) : current.rank,
            updatedAt: new Date() }).where(eq(tasks.id, taskId));
          await touchTaskQueue(tx, current.assignedTo, null);
          if (assignedTo !== current.assignedTo) await touchTaskQueue(tx, assignedTo, null);
        }
        if (!baseline && prior.binding.observedState !== status) await tx.insert(activityLog).values({ projectId: link.projectId,
          entityType: "task", entityId: taskId, action: reopenPending ? "lectio_reopen_requested" : "lectio_progress",
          summary: reopenPending ? "Lectio work reopened; project manager review required" : "Translation progress updated from Lectio",
          data: { connectionId: connection.id, version: snapshot.version, status } });
      }
      seenTasks.push(taskId);
    }
    const mappedKeys = [...groups.values()].flat();
    const ready = document.steps.filter(s => mappedKeys.includes(s.key));
    const priorReady = link.snapshot?.documents.find(d => d.id === document.id)?.steps.filter(s => mappedKeys.includes(s.key));
    if (!baseline && handoffPhase && handoffTaskId && ready.every(s => s.state === "completed") &&
      !priorReady?.every(s => s.state === "completed")) {
      const completedAt = new Date(Math.max(...ready.map(s => Date.parse(s.completedAt!))));
      await handoffTranslation(tx, { taskId: handoffTaskId, expectedAssigneeId: localTasks.find(t => t.id === handoffTaskId)?.assignedTo ?? null, projectId: link.projectId, projectSlug: project.slug,
        connectionId: connection.id, eventKey: `lectio-handoff-${link.id}-${document.id}-${completedAt.toISOString()}`,
        completedAt, timezone: settings?.timezone || "UTC", durationDays: handoffPhase.durationDays ?? 0,
        coordinatorId: members.find(m => m.roleId === handoffPhase.projectRoleId)?.userId ?? null });
    }
  }
  // Tombstones preserve local history, financial references and downstream work.
  const retired = oldBindings.filter(b => !seenTasks.includes(b.task.id)).map(b => b.task.id);
  if (retired.length) {
    await tx.update(tasks).set({ lectioManaged: false }).where(inArray(tasks.id, retired));
    await tx.update(lectioTaskLinks).set({ reopenPending: false }).where(inArray(lectioTaskLinks.taskId, retired));
  }
  await tx.update(lectioTaskLinks).set({ active: false }).where(eq(lectioTaskLinks.linkId, link.id));
  await tx.update(lectioUnitLinks).set({ active: false }).where(eq(lectioUnitLinks.linkId, link.id));
  if (seenTasks.length) await tx.update(lectioTaskLinks).set({ active: true }).where(inArray(lectioTaskLinks.taskId, seenTasks));
  if (seenUnits.length) await tx.update(lectioUnitLinks).set({ active: true }).where(inArray(lectioUnitLinks.unitId, seenUnits));
  await tx.update(lectioProjectLinks).set({ snapshot, lastVersion: snapshot.version, state: "active", lastError: null,
    lastAppliedAt: new Date(), lastFetchedAt: new Date() }).where(eq(lectioProjectLinks.id, link.id));
  return { appliedVersion: snapshot.version };
}
