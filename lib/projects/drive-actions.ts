"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

const folderSchema = z.object({
  folderId: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  url: z.string().url().max(2000),
});

/**
 * Link a project's main Google Drive folder (picked via the Drive Picker, so
 * the picker also grants the app write access used by task uploads). Manager+.
 */
export async function setProjectDriveFolder(
  projectId: string,
  folder: z.infer<typeof folderSchema>
) {
  await requireRole("manager");
  const f = folderSchema.parse(folder);
  const [row] = await db
    .update(projects)
    .set({
      driveFolderId: f.folderId,
      driveFolderName: f.name,
      driveFolderUrl: f.url,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning({ slug: projects.slug });
  revalidatePath("/projects");
  if (row) revalidatePath(`/projects/${row.slug}`);
}

/** Remove a project's linked Drive folder. Manager+. */
export async function clearProjectDriveFolder(projectId: string) {
  await requireRole("manager");
  const [row] = await db
    .update(projects)
    .set({
      driveFolderId: null,
      driveFolderName: null,
      driveFolderUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning({ slug: projects.slug });
  revalidatePath("/projects");
  if (row) revalidatePath(`/projects/${row.slug}`);
}
