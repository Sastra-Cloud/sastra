"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { requireRole, requireUser } from "@/lib/auth/guards";
import { requireProjectCapability } from "@/lib/auth/project-access";
import { logActivity } from "@/lib/activity/log";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { requestCompletionMouInvoices } from "@/lib/budget/actions";
import { db } from "@/lib/db";
import {
  budgetItems,
  chatChannels,
  chatMessages,
  fileAttachments,
  files,
  projects,
  rightsItems,
  sharedMouMemberships,
  sponsorshipLines,
  sponsorshipReceiptAllocations,
  sponsorshipFundUses,
  invoices,
  taskDependencies,
  tasks,
  units,
} from "@/lib/db/schema";
import { deleteObject } from "@/lib/r2";
import { uniqueProjectSlug } from "@/lib/slug";
import { createProjectSchema, createProjectInTransaction } from "./create";
import { lectioConnections } from "@/lib/db/schema";
import { moduleEnabled } from "@/lib/workspace/modules";
import { parseProfile } from "@/lib/lectio/protocol/profile";
import { queueLectioProject } from "@/lib/lectio/create-project";
import { findLectioProjectMatches } from "@/lib/lectio/match-actions";
import { reevaluateSharedMouPayments } from "@/lib/agreements/readiness-engine";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { workflowProfile } from "@/lib/episodes/workflow";
import { ensureEpisodeWorkflow } from "@/lib/episodes/workflow-service";
import { requiredStages } from "@/lib/episodes/workflow";
import {
  isBookProjectKind,
  PRINT_FUNDING_STATUSES,
  PRINT_FUNDING_LABELS,
} from "./print-funding";
import {
  PROJECT_OPEN_STATUSES,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectOpenStatus,
} from "./status";

export type ProjectFormState = { error?: string; ok?: boolean };

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const { user } = await requireRole("manager");

  const parsed = createProjectSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    status: formData.get("status") || undefined,
    priority: formData.get("priority") || undefined,
    kind: formData.get("kind") || undefined,
    printFundingStatus: formData.get("printFundingStatus") || undefined,
    videoProductionMode: formData.get("videoProductionMode") || undefined,
    sourceLanguage: formData.get("sourceLanguage") || undefined,
    targetLanguage: formData.get("targetLanguage") || undefined,
    startDate: formData.get("startDate") || undefined,
    dueDate: formData.get("dueDate") || undefined,
    planTemplateId: formData.get("planTemplateId") || undefined,
    chapters: formData.get("chapters") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const slug = await uniqueProjectSlug(data.title);
  const workspace = await getWorkspaceSettings();
  let connectedId: string | null = null;
  let existingLectioProjectId: string | null = null;
  const requestedConnection = formData.get("lectioConnectionId");
  if (moduleEnabled(workspace.enabledModules, "lectio") && ["book", "article"].includes(data.kind || "") && requestedConnection !== "none") {
    const available = await db.select().from(lectioConnections).where(and(eq(lectioConnections.state, "active"),
      typeof requestedConnection === "string" && requestedConnection !== "auto" ? eq(lectioConnections.id, requestedConnection) : undefined));
    if (available.length === 1) {
      const choice = formData.get("lectioChoice");
      if (choice !== "new" && choice !== "existing") return { error: "Check for an existing Lectio project in the New project form, or turn its connection off before creating." };
      connectedId = available[0].id;
      const matches = await findLectioProjectMatches(connectedId, { name: data.title, sourceLanguage: data.sourceLanguage || "", targetLanguage: data.targetLanguage || "" });
      if ("error" in matches) return { error: matches.error };
      if (choice === "existing") {
        const remoteId = formData.get("lectioRemoteProjectId");
        if (typeof remoteId !== "string" || !remoteId) return { error: "Choose an existing Lectio project before continuing." };
        if (!matches.projects.some(project => project.id === remoteId)) return { error: "This Lectio project is no longer available. Check the matches again before creating." };
        existingLectioProjectId = remoteId;
      } else {
      if (!matches.allowNew) return { error: "Both administrators must approve new counterpart creation before continuing. Choose an existing project or turn the connection off." };
      try {
        const profile = parseProfile(available[0].profile);
        if (data.planTemplateId && data.planTemplateId !== "none" && data.planTemplateId !== profile.planTemplateId) return { error: "This Lectio connection uses a different project template. Choose its reviewed template or create this project without Lectio." };
        data.planTemplateId = profile.planTemplateId;
      } catch { return { error: "An administrator needs to review this Lectio connection’s project defaults before creating connected projects." }; }
      }
    } else if (typeof requestedConnection === "string" && !["auto", "none"].includes(requestedConnection)) return { error: "This Lectio connection is unavailable. Refresh and choose another connection." };
  }
  await db.transaction(async tx => {
    const project = await createProjectInTransaction(tx, { data, slug, workspace, actorId: user.id });
    if (connectedId && !existingLectioProjectId) await queueLectioProject(tx, connectedId, project.id);
  });

  revalidatePath("/projects");
  if (connectedId && existingLectioProjectId) redirect(`/projects/${slug}/translation?${new URLSearchParams({ lectioConnectionId: connectedId, lectioProjectId: existingLectioProjectId })}`);
  redirect(`/projects/${slug}?created=1`);
}

const updateSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().optional(),
  status: z.enum(PROJECT_STATUSES),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
});

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  await requireUser();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    status: formData.get("status"),
    priority: formData.get("priority"),
    startDate: formData.get("startDate") || undefined,
    dueDate: formData.get("dueDate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, ...data } = parsed.data;
  await requireProjectCapability(id);
  const [row] = await db
    .update(projects)
    .set({
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      startDate: data.startDate || null,
      dueDate: data.dueDate || null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning({ id: projects.id, slug: projects.slug });

  revalidatePath("/projects");
  if (row) {
    await reevaluateSharedMouPayments({ projectId: row.id });
    revalidatePath(`/projects/${row.slug}`);
  }
  return {};
}

const updateProjectTitleSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "Project name is required.").max(200),
});

export async function updateProjectTitle(
  projectId: string,
  title: string
): Promise<{ title?: string; error?: string }> {
  const { user } = await requireProjectCapability(projectId);
  const parsed = updateProjectTitleSchema.safeParse({ projectId, title });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the project name.",
    };
  }

  const [current] = await db
    .select({ id: projects.id, slug: projects.slug, title: projects.title })
    .from(projects)
    .where(eq(projects.id, parsed.data.projectId))
    .limit(1);
  if (!current) return { error: "Project not found." };
  if (current.title === parsed.data.title) return { title: current.title };

  const [updated] = await db
    .update(projects)
    .set({ title: parsed.data.title, updatedAt: new Date() })
    .where(eq(projects.id, current.id))
    .returning({ title: projects.title });
  if (!updated) return { error: "Project not found." };

  await logActivity({
    actorId: user.id,
    projectId: current.id,
    entityType: "project",
    entityId: current.id,
    action: "rename",
    summary: `Renamed “${current.title}” to “${updated.title}”`,
  });
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/overview");
  revalidatePath("/tasks");
  revalidatePath("/workload");
  revalidatePath("/schedule");
  revalidatePath(`/projects/${current.slug}`, "layout");
  return { title: updated.title };
}

export async function updateProjectLanguages(
  projectId: string,
  input: { sourceLanguage: string; targetLanguage: string; targetLanguageTitle: string }
): Promise<{ error?: string }> {
  const { user } = await requireProjectCapability(projectId);
  const parsed = z.object({
    sourceLanguage: z.string().trim().max(100),
    targetLanguage: z.string().trim().max(100),
    targetLanguageTitle: z.string().trim().max(300),
  }).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the language settings." };
  const [project] = await db.update(projects).set({
    sourceLanguage: parsed.data.sourceLanguage || null,
    targetLanguage: parsed.data.targetLanguage || null,
    targetLanguageTitle: parsed.data.targetLanguageTitle || null,
    updatedAt: new Date(),
  }).where(eq(projects.id, projectId)).returning({ slug: projects.slug, title: projects.title });
  if (!project) return { error: "Project not found." };
  await logActivity({ actorId: user.id, projectId, entityType: "project", entityId: projectId, action: "languages", summary: `Updated language settings for “${project.title}”` });
  revalidatePath(`/projects/${project.slug}`);
  return {};
}

export async function updateProjectStatus(
  projectId: string,
  status: ProjectOpenStatus
): Promise<{ error?: string }> {
  const { user } = await requireProjectCapability(projectId);
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      status: z.enum(PROJECT_OPEN_STATUSES),
    })
    .safeParse({ projectId, status });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the project status." };
  }

  const [project] = await db
    .update(projects)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(projects.id, parsed.data.projectId))
    .returning({ id: projects.id, slug: projects.slug, title: projects.title });
  if (!project) return { error: "Project not found." };

  await logActivity({
    actorId: user.id,
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    action: "status",
    summary: `Changed “${project.title}” status to ${PROJECT_STATUS_LABELS[parsed.data.status]}`,
  });
  await recomputeProjectBlockers(project.id);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/overview");
  revalidatePath("/schedule");
  revalidatePath(`/projects/${project.slug}`);
  return {};
}

/** Update the explicit print-plan and funding flag for a book project. */
export async function updateProjectPrintFunding(
  projectId: string,
  status: (typeof PRINT_FUNDING_STATUSES)[number]
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const parsed = z.enum(PRINT_FUNDING_STATUSES).safeParse(status);
  if (!parsed.success) return { error: "Choose a valid print funding status." };

  const [current] = await db
    .select({ id: projects.id, slug: projects.slug, title: projects.title, kind: projects.kind })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!current) return { error: "Project not found." };
  if (!isBookProjectKind(current.kind)) {
    return { error: "Print funding status is only available for book projects." };
  }

  await db
    .update(projects)
    .set({ printFundingStatus: parsed.data, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "print_funding",
    summary: `Set “${current.title}” print funding to ${PRINT_FUNDING_LABELS[parsed.data]}`,
  });
  revalidatePath(`/projects/${current.slug}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return {};
}

/**
 * Set a project's type (book / article / podcast / video series / other).
 * Drives which work path it schedules on and its default duration.
 * Manager/admin only.
 */
export async function updateProjectKind(
  projectId: string,
  kind: "book" | "article" | "podcast" | "video_series" | "other"
): Promise<{ error?: string }> {
  const { user } = await requireProjectCapability(projectId);
  const parsed = z.enum(["book", "article", "podcast", "video_series", "other"]).safeParse(kind);
  if (!parsed.success) return { error: "Choose a valid project type." };
  const [project] = await db
    .update(projects)
    .set({
      kind: parsed.data,
      videoProductionMode: parsed.data === "video_series" ? "original" : null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning({ slug: projects.slug, title: projects.title });
  if (!project) return { error: "Project not found." };
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "kind",
    summary: `Set “${project.title}” type to ${parsed.data}`,
  });
  if (parsed.data === "video_series") {
    const reconciled = await updateVideoProductionMode(projectId, "original");
    if (reconciled.error) return reconciled;
  }
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/schedule");
  return {};
}

/**
 * Change a video series' project-wide editorial workflow. Obsolete untouched
 * generated stages are removed; tasks with any human activity are preserved as
 * ordinary project tasks so a mode change never destroys real work.
 */
export async function updateVideoProductionMode(
  projectId: string,
  mode: "original" | "translation"
): Promise<{ error?: string; removed?: number; preserved?: number; created?: number }> {
  const { user } = await requireProjectCapability(projectId);
  const parsed = z.enum(["original", "translation"]).safeParse(mode);
  if (!parsed.success) return { error: "Choose a valid video production mode." };

  const [project] = await db
    .select({
      id: projects.id,
      slug: projects.slug,
      title: projects.title,
      kind: projects.kind,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project || project.kind !== "video_series") {
    return { error: "Video production mode is only available for video series." };
  }
  const profile = workflowProfile({
    kind: "video_series",
    videoProductionMode: parsed.data,
    videoRequired: true,
  });
  const nextStages = requiredStages(profile);
  const obsolete = await db
    .select({
      id: tasks.id,
      pristine: sql<boolean>`
        ${tasks.status} = 'todo'
        and ${tasks.priority} = 'medium'
        and ${tasks.assignedTo} is null
        and ${tasks.description} is null
        and ${tasks.estimateHours} is null
        and ${tasks.orderIndex} = 0
        and ${tasks.rank} = 0
        and ${tasks.dueDateIsManual} = false
        and ${tasks.completedAt} is null
        and ${tasks.driveFolderId} is null
        and ${tasks.driveFolderName} is null
        and ${tasks.driveFolderUrl} is null
        and ${tasks.phaseId} is null
        and ${tasks.isMilestone} = false
        and ${tasks.printRunId} is null
        and ${tasks.printPaymentId} is null
        and ${tasks.sourceTaskTemplateId} is null
        and ${tasks.sourceRecurringTaskId} is null
        and ${tasks.title} = (
          select u.name || ': ' || case ${tasks.podcastStage}
            when 'concept_outline' then 'Create concept and outline'
            when 'write_script' then 'Write script'
            when 'approve_script' then 'Review and approve script'
            when 'translate_script' then 'Translate script'
            when 'approve_translation' then 'Edit and approve translation'
            when 'record_audio' then 'Record audio'
            when 'master_audio' then 'Edit and master audio'
          end
          from units u where u.id = ${tasks.unitId}
        )
        and not exists (select 1 from task_comments tc where tc.task_id = ${tasks.id})
        and not exists (select 1 from task_drive_files tdf where tdf.task_id = ${tasks.id})
        and not exists (select 1 from time_entries te where te.task_id = ${tasks.id})
        and not exists (
          select 1 from file_attachments fa
          where fa.target_type = 'task' and fa.target_id = ${tasks.id}
        )
      `.mapWith(Boolean),
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        notInArray(tasks.podcastStage, nextStages)
      )
    );
  const removableIds = obsolete.filter((task) => task.pristine).map((task) => task.id);
  const preservedIds = obsolete.filter((task) => !task.pristine).map((task) => task.id);

  await db.transaction(async (tx) => {
    const obsoleteIds = [...removableIds, ...preservedIds];
    if (obsoleteIds.length > 0) {
      await tx
        .delete(taskDependencies)
        .where(
          or(
            inArray(taskDependencies.taskId, obsoleteIds),
            inArray(taskDependencies.dependsOnTaskId, obsoleteIds)
          )
        );
    }
    if (removableIds.length > 0) {
      await tx.delete(tasks).where(inArray(tasks.id, removableIds));
    }
    if (preservedIds.length > 0) {
      await tx
        .update(tasks)
        .set({ podcastStage: null, updatedAt: new Date() })
        .where(inArray(tasks.id, preservedIds));
    }
    await tx
      .update(projects)
      .set({
        videoProductionMode: parsed.data,
        videoRequired: true,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
    await tx
      .update(units)
      .set({ videoRequiredOverride: null })
      .where(eq(units.projectId, projectId));
  });

  const projectUnits = await db
    .select({ id: units.id })
    .from(units)
    .where(eq(units.projectId, projectId));
  let created = 0;
  for (const unit of projectUnits) {
    const result = await ensureEpisodeWorkflow(unit.id, user.id, {
      notifyAssignments: false,
    });
    created += result.createdTaskIds.length;
  }

  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "video_production_mode",
    summary: `Changed “${project.title}” video workflow to ${parsed.data}`,
  });
  revalidatePath("/projects");
  revalidatePath("/schedule");
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath(`/projects/${project.slug}/episodes`);
  revalidatePath(`/projects/${project.slug}/tasks`);
  return {
    removed: removableIds.length,
    preserved: preservedIds.length,
    created,
  };
}

export async function completeProject(
  projectId: string
): Promise<{ error?: string; invoiceTasks?: number }> {
  const { user } = await requireProjectCapability(projectId);
  const [project] = await db
    .update(projects)
    .set({ status: "completed", updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id, slug: projects.slug, title: projects.title });
  if (!project) return { error: "Project not found." };

  const invoiceTasks = await requestCompletionMouInvoices(project.id, user.id);
  await logActivity({
    actorId: user.id,
    projectId: project.id,
    entityType: "project",
    action: "status",
    summary: `Marked "${project.title}" complete`,
  });
  await recomputeProjectBlockers(project.id);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  revalidatePath(`/projects/${project.slug}`);
  revalidatePath(`/projects/${project.slug}/tasks`);
  revalidatePath(`/projects/${project.slug}/budget`);
  return { invoiceTasks };
}

const deleteSchema = z.object({
  id: z.string().uuid(),
  confirmTitle: z.string().trim().min(1, "Type the project title to confirm."),
});

export async function deleteProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  await requireRole("manager");

  const parsed = deleteSchema.safeParse({
    id: formData.get("id"),
    confirmTitle: formData.get("confirmTitle"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [project] = await db
    .select({ id: projects.id, slug: projects.slug, title: projects.title })
    .from(projects)
    .where(eq(projects.id, parsed.data.id))
    .limit(1);
  if (!project) return { error: "Project not found." };

  const [sharedAgreement] = await db
    .select({ id: sharedMouMemberships.id })
    .from(sharedMouMemberships)
    .where(
      and(
        eq(sharedMouMemberships.projectId, project.id),
        eq(sharedMouMemberships.active, true)
      )
    )
    .limit(1);
  if (sharedAgreement) {
    return {
      error:
        "Remove or replace this project on its Shared MoU before deleting it.",
    };
  }

  const [sponsorshipHistory] = await db.select({
    exists: sql<boolean>`exists(select 1 from ${sponsorshipLines} where ${sponsorshipLines.projectId} = ${project.id})
      or exists(select 1 from ${sponsorshipReceiptAllocations} where ${sponsorshipReceiptAllocations.projectId} = ${project.id})
      or exists(select 1 from ${sponsorshipFundUses} where ${sponsorshipFundUses.projectId} = ${project.id})
      or exists(select 1 from ${invoices} where ${invoices.projectId} = ${project.id} and ${invoices.sponsorshipId} is not null)`,
  }).from(projects).where(eq(projects.id, project.id)).limit(1);
  if (sponsorshipHistory?.exists) {
    return { error: "This book has sponsorship history. Keep the project to preserve its invoices and funding records." };
  }

  if (parsed.data.confirmTitle !== project.title) {
    return { error: `Type "${project.title}" exactly to delete this project.` };
  }

  const r2Keys = await db.transaction(async (tx) => {
    const taskRows = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.projectId, project.id));
    const rightRows = await tx
      .select({ id: rightsItems.id })
      .from(rightsItems)
      .where(eq(rightsItems.projectId, project.id));
    const budgetRows = await tx
      .select({ id: budgetItems.id })
      .from(budgetItems)
      .where(eq(budgetItems.projectId, project.id));
    const channelRows = await tx
      .select({ id: chatChannels.id })
      .from(chatChannels)
      .where(eq(chatChannels.projectId, project.id));
    const messageRows =
      channelRows.length > 0
        ? await tx
            .select({ id: chatMessages.id })
            .from(chatMessages)
            .where(
              inArray(
                chatMessages.channelId,
                channelRows.map((r) => r.id)
              )
            )
        : [];

    const attachmentFilters: SQL[] = [];
    const projectAttachmentFilter = and(
      eq(fileAttachments.targetType, "project"),
      eq(fileAttachments.targetId, project.id)
    );
    if (projectAttachmentFilter) attachmentFilters.push(projectAttachmentFilter);

    const taskIds = taskRows.map((r) => r.id);
    if (taskIds.length > 0) {
      const taskAttachmentFilter = and(
        eq(fileAttachments.targetType, "task"),
        inArray(fileAttachments.targetId, taskIds)
      );
      if (taskAttachmentFilter) attachmentFilters.push(taskAttachmentFilter);
    }

    const rightIds = rightRows.map((r) => r.id);
    if (rightIds.length > 0) {
      const rightsAttachmentFilter = and(
        eq(fileAttachments.targetType, "rights_item"),
        inArray(fileAttachments.targetId, rightIds)
      );
      if (rightsAttachmentFilter) attachmentFilters.push(rightsAttachmentFilter);
    }

    const budgetIds = budgetRows.map((r) => r.id);
    if (budgetIds.length > 0) {
      const budgetAttachmentFilter = and(
        eq(fileAttachments.targetType, "budget_item"),
        inArray(fileAttachments.targetId, budgetIds)
      );
      if (budgetAttachmentFilter) attachmentFilters.push(budgetAttachmentFilter);
    }

    const messageIds = messageRows.map((r) => r.id);
    if (messageIds.length > 0) {
      const messageAttachmentFilter = and(
        eq(fileAttachments.targetType, "message"),
        inArray(fileAttachments.targetId, messageIds)
      );
      if (messageAttachmentFilter) attachmentFilters.push(messageAttachmentFilter);
    }

    const orphanR2Keys: string[] = [];
    if (attachmentFilters.length > 0) {
      const removedAttachments = await tx
        .delete(fileAttachments)
        .where(or(...attachmentFilters))
        .returning({ fileId: fileAttachments.fileId });
      const affectedFileIds = [
        ...new Set(removedAttachments.map((a) => a.fileId)),
      ];

      if (affectedFileIds.length > 0) {
        const stillAttached = await tx
          .select({ fileId: fileAttachments.fileId })
          .from(fileAttachments)
          .where(inArray(fileAttachments.fileId, affectedFileIds));
        const retainedFileIds = new Set(stillAttached.map((a) => a.fileId));
        const orphanFileIds = affectedFileIds.filter(
          (fileId) => !retainedFileIds.has(fileId)
        );

        if (orphanFileIds.length > 0) {
          const removedFiles = await tx
            .delete(files)
            .where(inArray(files.id, orphanFileIds))
            .returning({ r2Key: files.r2Key });
          orphanR2Keys.push(...removedFiles.map((f) => f.r2Key));
        }
      }
    }

    await tx.delete(projects).where(eq(projects.id, project.id));
    return orphanR2Keys;
  });

  for (const key of r2Keys) {
    try {
      await deleteObject(key);
    } catch {
      // Best-effort object cleanup; the DB delete is the source of truth.
    }
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${project.slug}`);
  return { ok: true };
}
