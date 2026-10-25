import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { hasProjectCapability } from "@/lib/auth/project-access";
import { db } from "@/lib/db";
import { lectioConnections, lectioOperations, lectioProjectLinks, units, files, fileAttachments, lectioTaskLinks, lectioUserLinks, projectMembers, user, phases, projects, tasks } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { moduleEnabled } from "@/lib/workspace/modules";
import { SourceImport } from "@/components/lectio/source-import";
import { AssignmentRequest } from "@/components/lectio/assignment-request";
import { ProjectTranslation } from "@/components/lectio/project-translation";
export const metadata = { title: "Translation" };
export default async function TranslationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireUser();
  if (!moduleEnabled((await getWorkspaceSettings()).enabledModules, "lectio")) notFound();
  const { slug } = await params;
  const [project] = await db.select({ id: projects.id, title: projects.title, sourceLanguage: projects.sourceLanguage, targetLanguage: projects.targetLanguage }).from(projects).where(eq(projects.slug, slug));
  if (!project) notFound();
  const [canManage, localPhases, connections, links, reopens] = await Promise.all([
    hasProjectCapability(session.user, project.id, "project.edit"),
    db.select({ id: phases.id, name: phases.name }).from(phases).where(eq(phases.projectId, project.id)).orderBy(phases.orderIndex),
    db.select({ id: lectioConnections.id, teamName: lectioConnections.teamName }).from(lectioConnections).where(eq(lectioConnections.state, "active")),
    db.select({ link: lectioProjectLinks, origin: lectioConnections.origin }).from(lectioProjectLinks).innerJoin(lectioConnections, eq(lectioConnections.id, lectioProjectLinks.connectionId)).where(and(eq(lectioProjectLinks.projectId, project.id), inArray(lectioProjectLinks.state, ["active", "linking", "removed"]))),
    db.select({ id: tasks.id, title: tasks.title }).from(lectioTaskLinks).innerJoin(tasks, eq(tasks.id, lectioTaskLinks.taskId))
      .where(and(eq(tasks.projectId, project.id), eq(lectioTaskLinks.reopenPending, true), eq(lectioTaskLinks.active, true))),
  ]);
  const existingUnits = await db.select({ id: units.id, name: units.name }).from(units).where(eq(units.projectId, project.id)).orderBy(units.orderIndex);
  const row = links[0];
  const [creation] = row?.link.remoteProjectId.startsWith("pending-") ? await db.select({ error: lectioOperations.lastError }).from(lectioOperations).where(and(eq(lectioOperations.connectionId, row.link.connectionId), eq(lectioOperations.operationId, `create-${row.link.projectKey}`), eq(lectioOperations.direction, "out"))) : [];
  const link = row ? { id: row.link.id, generation: row.link.generation, state: row.link.state, snapshot: row.link.snapshot, lastError: row.link.lastError,
    reviewRequired: !row.link.remoteProjectId.startsWith("pending-") && row.link.state === "linking" && !row.link.stageMap.length,
    lastAppliedAt: row.link.lastAppliedAt?.toISOString() ?? null, href: row.link.remoteProjectId.startsWith("pending-") ? null : `${row.origin}/translate/${encodeURIComponent(row.link.remoteProjectId)}` } : null;
  if (link && creation?.error) link.lastError = creation.error;
  const people = row && canManage ? await db.select({ id: user.id, name: user.name }).from(lectioUserLinks)
    .innerJoin(user, and(eq(user.id, lectioUserLinks.userId), eq(user.isActive, true)))
    .innerJoin(projectMembers, and(eq(projectMembers.userId, user.id), eq(projectMembers.projectId, project.id)))
    .where(eq(lectioUserLinks.connectionId, row.link.connectionId)) : [];
  const operations = row && canManage ? await db.select({ id: lectioOperations.id, state: lectioOperations.state, result: lectioOperations.result, error: lectioOperations.lastError }).from(lectioOperations)
    .where(and(eq(lectioOperations.connectionId, row.link.connectionId), eq(lectioOperations.kind, "assignment"), sql`${lectioOperations.payload}->>'linkId' = ${row.link.id}`)).orderBy(desc(lectioOperations.createdAt)).limit(10) : [];
  const sourceFiles = canManage && row ? await db.select({ id: files.id, name: files.originalName, size: files.sizeBytes }).from(files)
    .innerJoin(fileAttachments, eq(fileAttachments.fileId, files.id)).where(and(eq(files.status, "ready"), eq(fileAttachments.targetType, "project"), eq(fileAttachments.targetId, project.id))) : [];
  const sourceOperations = canManage && row ? await db.select().from(lectioOperations).where(and(eq(lectioOperations.connectionId, row.link.connectionId), eq(lectioOperations.kind, "source-file"), sql`${lectioOperations.payload}->>'linkId' = ${row.link.id}`)).orderBy(desc(lectioOperations.createdAt)).limit(30) : [];
  const query = await searchParams;
  return <div className="space-y-5"><ProjectTranslation projectId={project.id} projectName={project.title} sourceLanguage={project.sourceLanguage || ""} targetLanguage={project.targetLanguage || ""} initialConnectionId={typeof query.lectioConnectionId === "string" ? query.lectioConnectionId : undefined} initialRemoteProjectId={typeof query.lectioProjectId === "string" ? query.lectioProjectId : undefined} canManage={canManage} existingUnits={existingUnits} phases={localPhases} connections={connections} link={link} reopens={reopens} />{canManage && row?.link.state === "active" && row.link.snapshot ? <AssignmentRequest projectId={project.id} snapshot={row.link.snapshot} people={people} operations={operations} /> : null}
    {canManage && row?.link.state === "active" ? <SourceImport projectId={project.id} files={[...new Map(sourceFiles.filter(f => /\.(docx|odt|idml)$/i.test(f.name) && f.size <= 50 * 1024 * 1024).map(f => [f.id, f])).values()]} operations={sourceOperations.map(op => ({ id: op.id, state: op.state, result: op.result, error: op.lastError, name: String((op.payload.body as Record<string, unknown>)?.name || "Source document") }))} /> : null}</div>;
}
