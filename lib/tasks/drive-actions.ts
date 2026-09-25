"use server";

import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/guards";
import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db";
import { account, projects, taskDriveFiles, tasks } from "@/lib/db/schema";
import { revalidateForTask } from "./create";

export type DriveAttachContext = {
  /** Picker API key + shared drive id are configured on the server. */
  configured: boolean;
  /** The current user has linked a Google account. */
  connected: boolean;
  apiKey: string | null;
  appId: string | null;
  sharedDriveId: string | null;
};

/** OAuth client ids look like "<projectNumber>-xxxx.apps.googleusercontent.com". */
function projectNumberFromClientId(): string | null {
  const num = (process.env.GOOGLE_CLIENT_ID ?? "").split("-")[0];
  return /^\d+$/.test(num) ? num : null;
}

export async function getDriveAttachContext(): Promise<DriveAttachContext> {
  const { user } = await requireUser();
  const apiKey = process.env.GOOGLE_PICKER_API_KEY || null;
  const sharedDriveId = process.env.GOOGLE_SHARED_DRIVE_ID || null;
  const configured = !!(apiKey && sharedDriveId && process.env.GOOGLE_CLIENT_ID);

  const [acct] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, user.id), eq(account.providerId, "google")))
    .limit(1);

  return {
    configured,
    connected: !!acct,
    apiKey,
    appId: projectNumberFromClientId(),
    sharedDriveId,
  };
}

/** Fresh Google access token for the Picker (refreshed server-side if expired). */
export async function getDriveOAuthToken(): Promise<string | null> {
  await requireUser();
  try {
    const res = await auth.api.getAccessToken({
      body: { providerId: "google" },
      headers: await headers(),
    });
    return res?.accessToken ?? null;
  } catch {
    return null;
  }
}

const fileSchema = z.object({
  driveFileId: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  mimeType: z.string().max(200).nullable().optional(),
  iconUrl: z.string().max(1000).nullable().optional(),
  url: z.string().url().max(2000),
});

async function taskProjectId(taskId: string): Promise<string | null> {
  const [t] = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  return t?.projectId ?? null;
}

export async function addTaskDriveFile(
  taskId: string,
  file: z.infer<typeof fileSchema>
) {
  const { user } = await requireUser();
  const f = fileSchema.parse(file);
  await db
    .insert(taskDriveFiles)
    .values({
      taskId,
      driveFileId: f.driveFileId,
      name: f.name,
      mimeType: f.mimeType ?? null,
      iconUrl: f.iconUrl ?? null,
      url: f.url,
      addedBy: user.id,
    })
    .onConflictDoNothing();
  await revalidateForTask(await taskProjectId(taskId));
}

export async function removeTaskDriveFile(id: string) {
  await requireUser();
  const [row] = await db
    .delete(taskDriveFiles)
    .where(eq(taskDriveFiles.id, id))
    .returning({ taskId: taskDriveFiles.taskId });
  if (!row) return;
  await revalidateForTask(await taskProjectId(row.taskId));
}

export type TaskDriveFile = {
  id: string;
  driveFileId: string;
  name: string;
  mimeType: string | null;
  iconUrl: string | null;
  url: string;
};

export async function listTaskDriveFiles(
  taskId: string
): Promise<TaskDriveFile[]> {
  await requireUser();
  return db
    .select({
      id: taskDriveFiles.id,
      driveFileId: taskDriveFiles.driveFileId,
      name: taskDriveFiles.name,
      mimeType: taskDriveFiles.mimeType,
      iconUrl: taskDriveFiles.iconUrl,
      url: taskDriveFiles.url,
    })
    .from(taskDriveFiles)
    .where(eq(taskDriveFiles.taskId, taskId))
    .orderBy(asc(taskDriveFiles.createdAt));
}

const folderSchema = z.object({
  folderId: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  url: z.string().url().max(2000),
});

/** Set a task's default working Drive folder (its upload destination). */
export async function setTaskDriveFolder(
  taskId: string,
  folder: z.infer<typeof folderSchema>
) {
  await requireUser();
  const f = folderSchema.parse(folder);
  const [row] = await db
    .update(tasks)
    .set({
      driveFolderId: f.folderId,
      driveFolderName: f.name,
      driveFolderUrl: f.url,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning({ projectId: tasks.projectId });
  await revalidateForTask(row?.projectId ?? null);
}

/** Clear a task's default working Drive folder. */
export async function clearTaskDriveFolder(taskId: string) {
  await requireUser();
  const [row] = await db
    .update(tasks)
    .set({
      driveFolderId: null,
      driveFolderName: null,
      driveFolderUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
    .returning({ projectId: tasks.projectId });
  await revalidateForTask(row?.projectId ?? null);
}

export type DriveFolderRef = { id: string; name: string; url: string };

export type TaskDriveTarget = {
  /** The task's own working folder, if set. */
  taskFolder: DriveFolderRef | null;
  /** The task's project's main folder, if linked. */
  projectFolder: DriveFolderRef | null;
};

/**
 * Resolve the default upload destination for a task: its own working folder
 * plus the project's main folder (fallback). `TaskRow` doesn't carry projectId,
 * so the dialog fetches this on open rather than deriving it client-side.
 */
export async function getTaskDriveTarget(
  taskId: string
): Promise<TaskDriveTarget> {
  await requireUser();
  const [t] = await db
    .select({
      projectId: tasks.projectId,
      folderId: tasks.driveFolderId,
      folderName: tasks.driveFolderName,
      folderUrl: tasks.driveFolderUrl,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!t) return { taskFolder: null, projectFolder: null };

  const taskFolder: DriveFolderRef | null =
    t.folderId && t.folderName && t.folderUrl
      ? { id: t.folderId, name: t.folderName, url: t.folderUrl }
      : null;

  let projectFolder: DriveFolderRef | null = null;
  if (t.projectId) {
    const [p] = await db
      .select({
        folderId: projects.driveFolderId,
        folderName: projects.driveFolderName,
        folderUrl: projects.driveFolderUrl,
      })
      .from(projects)
      .where(eq(projects.id, t.projectId))
      .limit(1);
    if (p?.folderId && p.folderName && p.folderUrl) {
      projectFolder = { id: p.folderId, name: p.folderName, url: p.folderUrl };
    }
  }
  return { taskFolder, projectFolder };
}
