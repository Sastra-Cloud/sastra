import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { activityLog, lectioOperations, lectioProjectLinks, lectioTaskLinks, lectioUserLinks, notifications, projectManagers, projects, tasks, user, workspaceSettings } from "@/lib/db/schema";
import { can } from "@/lib/auth/policy";
import { assertVerifiedLectioActor } from "./identity";
import type { IntegrationTransaction, LectioConnection } from "./endpoint";
import { identifier, integer, IntegrationError, object } from "./protocol/contract";
import { canonicalJson, digest } from "./protocol/signing";
import { parseScheduleEdit, type PlanningSchedule, validateScheduleEdit } from "./protocol/planning";
import { dueDateChangeBody } from "@/lib/tasks/due-date-copy";

type Link = typeof lectioProjectLinks.$inferSelect;

/** Caller holds the connection and project-link locks, including the module/Cloud gate. */
export async function queuePlanning(tx: IntegrationTransaction, link: Link, timezone: string) {
  if (!link.projectId || !link.snapshot) return false;
  const [project] = await tx.select({ startDate: projects.startDate, dueDate: projects.dueDate }).from(projects).where(eq(projects.id, link.projectId));
  if (!project) return false;
  const dates = await tx.select({ documentId: lectioTaskLinks.documentId, keys: lectioTaskLinks.stepKeys, dueDate: tasks.dueDate })
    .from(lectioTaskLinks).innerJoin(tasks, and(eq(tasks.id, lectioTaskLinks.taskId), eq(tasks.projectId, link.projectId)))
    .where(and(eq(lectioTaskLinks.linkId, link.id), eq(lectioTaskLinks.active, true))).orderBy(tasks.id);
  const planning = { timezone, startDate: project.startDate, dueDate: project.dueDate,
    documents: link.snapshot.documents.map(d => ({ documentId: d.id, dueDate: null,
      steps: d.steps.map(s => ({ key: s.key, dueDate: dates.find(t => t.documentId === d.id && t.keys.includes(s.key))?.dueDate ?? null })) })) };
  const fingerprint = digest(JSON.stringify(planning));
  const [last] = await tx.select({ fingerprint: lectioOperations.fingerprint }).from(lectioOperations)
    .where(and(eq(lectioOperations.connectionId, link.connectionId), eq(lectioOperations.operationId, `planning-${link.id}-${link.generation}-${link.planningVersion}`), eq(lectioOperations.direction, "out"))).limit(1);
  if (last?.fingerprint === fingerprint) return false;
  const version = link.planningVersion + 1;
  await tx.insert(lectioOperations).values({ connectionId: link.connectionId, direction: "out", operationId: `planning-${link.id}-${link.generation}-${version}`,
    kind: `planning-${link.id}`, fingerprint,
    payload: { linkId: link.id, path: "/api/integrations/sastra/v1/planning", body: { projectId: link.remoteProjectId, generation: link.generation, planning: { ...planning, version } } } });
  await tx.update(lectioProjectLinks).set({ planningVersion: version }).where(eq(lectioProjectLinks.id, link.id));
  return true;
}

async function scheduleContext(tx: IntegrationTransaction, connection: LectioConnection, input: unknown) {
  const body = object(input), remoteProjectId = identifier(body.projectId), actorId = identifier(body.actorId), generation = integer(body.generation, 1);
  const [link] = await tx.select().from(lectioProjectLinks).where(and(eq(lectioProjectLinks.connectionId, connection.id), eq(lectioProjectLinks.remoteProjectId, remoteProjectId))).for("update");
  if (!link?.projectId || link.state !== "active" || link.generation !== generation) throw new IntegrationError("link_inactive", "Reconnect this project before editing its schedule.", 409);
  const [person] = await tx.select({ id: user.id, role: user.role, active: user.isActive, bot: user.isBot }).from(lectioUserLinks)
    .innerJoin(user, eq(user.id, lectioUserLinks.userId))
    .where(and(eq(lectioUserLinks.connectionId, connection.id), eq(lectioUserLinks.remoteUserId, actorId))).for("share", { of: user });
  if (!person?.active || person.bot) throw new IntegrationError("identity_required", "Ask an administrator to match your accounts in Sastra Settings → Lectio.", 403);
  await assertVerifiedLectioActor(tx, connection.origin, person.id, actorId);
  if (!can(person.role, "project.edit")) {
    const [grant] = await tx.select({ id: projectManagers.id }).from(projectManagers)
      .where(and(eq(projectManagers.projectId, link.projectId), eq(projectManagers.userId, person.id))).for("share");
    if (!grant) throw new IntegrationError("forbidden", "Ask a Sastra project manager to update this schedule.", 403);
  }
  const [project] = await tx.select({ id: projects.id, slug: projects.slug, startDate: projects.startDate, dueDate: projects.dueDate }).from(projects).where(eq(projects.id, link.projectId)).for("update");
  if (!project) throw new IntegrationError("project_removed", "This Sastra project no longer exists.", 410);
  const [settings] = await tx.select({ timezone: workspaceSettings.timezone }).from(workspaceSettings).where(eq(workspaceSettings.id, "workspace"));
  const rows = await tx.select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, assignedTo: tasks.assignedTo,
    documentId: lectioTaskLinks.documentId, stepKeys: lectioTaskLinks.stepKeys }).from(lectioTaskLinks)
    .innerJoin(tasks, and(eq(tasks.id, lectioTaskLinks.taskId), eq(tasks.projectId, project.id), eq(tasks.lectioManaged, true)))
    .where(and(eq(lectioTaskLinks.linkId, link.id), eq(lectioTaskLinks.active, true))).orderBy(tasks.id).for("update", { of: tasks });
  const value = { timezone: settings.timezone, startDate: project.startDate, dueDate: project.dueDate,
    tasks: rows.map(row => ({ id: row.id, title: row.title,
      documentName: link.snapshot?.documents.find(d => d.id === row.documentId)?.name ?? "Translation document", dueDate: row.dueDate })) };
  const revision = digest(canonicalJson({ ...value, generation: link.generation, linkId: link.id, mappings: rows.map(r => [r.id, r.documentId, r.stepKeys]) }));
  return { body, link, project, person, rows, schedule: { ...value, revision } satisfies PlanningSchedule };
}

export async function readSchedule(tx: IntegrationTransaction, connection: LectioConnection, input: unknown) {
  return { schedule: (await scheduleContext(tx, connection, input)).schedule };
}

export async function updateSchedule(tx: IntegrationTransaction, connection: LectioConnection, input: unknown) {
  const context = await scheduleContext(tx, connection, input), edit = parseScheduleEdit(context.body.schedule);
  validateScheduleEdit(context.schedule, edit);
  await tx.update(projects).set({ startDate: edit.startDate, dueDate: edit.dueDate, updatedAt: new Date() }).where(eq(projects.id, context.project.id));
  const changed = context.rows.filter(row => edit.tasks.find(t => t.id === row.id)!.dueDate !== row.dueDate);
  for (const row of changed) {
    const dueDate = edit.tasks.find(t => t.id === row.id)!.dueDate;
    await tx.update(tasks).set({ dueDate, dueDateIsManual: true, updatedAt: new Date() }).where(eq(tasks.id, row.id));
    await tx.insert(activityLog).values({ actorId: context.person.id, projectId: context.project.id, entityType: "task", entityId: row.id,
      action: "due_date", summary: `Updated deadline from Lectio: ${row.title}`, data: { previousDueDate: row.dueDate, dueDate } });
    if (row.assignedTo && row.assignedTo !== context.person.id) {
      const [notification] = await tx.insert(notifications).values({ userId: row.assignedTo, eventKey: `lectio-date-${row.id}-${context.schedule.revision}-${dueDate}`,
        type: "task_due_date_changed", title: `Due date changed: ${row.title}`, body: dueDateChangeBody(row.title, dueDate),
        link: `/projects/${context.project.slug}/tasks?task=${row.id}`, data: { taskId: row.id, dueDate } }).onConflictDoNothing().returning();
      if (notification) await tx.insert(lectioOperations).values({ connectionId: connection.id, operationId: `email-${notification.id}`, direction: "out", kind: "notification-email", fingerprint: digest(notification.id),
        payload: { notificationId: notification.id, recipientId: row.assignedTo, type: "task_due_date_changed" } });
    }
  }
  if (changed.length) await tx.delete(notifications).where(and(eq(notifications.type, "task_overdue"), inArray(sql<string>`(${notifications.data} ->> 'taskId')`, changed.map(t => t.id))));
  await tx.insert(activityLog).values({ actorId: context.person.id, projectId: context.project.id, entityType: "project", entityId: context.project.id,
    action: "lectio_schedule", summary: "Updated the project schedule from Lectio" });
  await queuePlanning(tx, context.link, context.schedule.timezone);
  return readSchedule(tx, connection, input);
}
