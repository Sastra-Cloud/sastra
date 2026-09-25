import "server-only";

import { and, asc, desc, eq, ne, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  budgetItems,
  documentImports,
  files,
  projectBudgetSettings,
  projects,
} from "@/lib/db/schema";
import { normalizeExtraction } from "@/lib/imports/schema";

export type ProjectTitle = { id: string; title: string; slug: string };

/**
 * Existing project with the fields needed to recognize the works a grant/MoU
 * funds: its funding partner and current budget total (in cents). Lets the
 * review screen offer to attach an agreement to the projects a proposal already
 * created, instead of minting a duplicate umbrella project.
 */
export type ProjectMatchRow = {
  id: string;
  title: string;
  slug: string;
  partnerName: string | null;
  budgetTotalCents: number;
};

export async function listProjectsForImportMatch(): Promise<ProjectMatchRow[]> {
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      slug: projects.slug,
      partnerName: projectBudgetSettings.partnerName,
      budgetTotalCents: sql<number>`coalesce(round(sum(coalesce(${budgetItems.amount}, 0)) * 100), 0)::int`,
    })
    .from(projects)
    .leftJoin(
      projectBudgetSettings,
      eq(projectBudgetSettings.projectId, projects.id)
    )
    .leftJoin(budgetItems, eq(budgetItems.projectId, projects.id))
    .groupBy(
      projects.id,
      projects.title,
      projects.slug,
      projectBudgetSettings.partnerName
    )
    .orderBy(asc(projects.title));
  return rows.map((row) => ({
    ...row,
    budgetTotalCents: Number(row.budgetTotalCents) || 0,
  }));
}

/**
 * How many OTHER documents are still queued to update this project (not yet
 * committed or discarded), excluding the one being reviewed. Drives the
 * "N more queued" hint during a multi-document update.
 */
export async function countPendingUpdateImports(
  projectId: string,
  excludeImportId: string
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentImports)
    .where(
      and(
        eq(documentImports.targetProjectId, projectId),
        ne(documentImports.id, excludeImportId),
        notInArray(documentImports.status, ["committed", "discarded"])
      )
    );
  return row?.count ?? 0;
}

/** All projects (id/title/slug) — used to detect duplicate works on import. */
export async function listProjectTitles(): Promise<ProjectTitle[]> {
  return db
    .select({ id: projects.id, title: projects.title, slug: projects.slug })
    .from(projects)
    .orderBy(asc(projects.title));
}

export type ImportListItem = {
  id: string;
  status: string;
  fileName: string | null;
  projectCount: number;
  committedCount: number;
  /** Title of the first extracted project — used to flag same-work batches. */
  firstTitle: string | null;
  /** Set when this import updates a specific project (not create mode). */
  targetProjectId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Recent document imports for the list on the import page. */
export async function listImports(limit = 30): Promise<ImportListItem[]> {
  const rows = await db
    .select({
      id: documentImports.id,
      status: documentImports.status,
      fileName: files.originalName,
      extraction: documentImports.extraction,
      reviewed: documentImports.reviewed,
      committedProjectIds: documentImports.committedProjectIds,
      targetProjectId: documentImports.targetProjectId,
      error: documentImports.error,
      createdAt: documentImports.createdAt,
      updatedAt: documentImports.updatedAt,
    })
    .from(documentImports)
    .leftJoin(files, eq(files.id, documentImports.fileId))
    .orderBy(desc(documentImports.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const projectsData = (r.reviewed ?? r.extraction)?.projects ?? [];
    return {
      id: r.id,
      status: r.status,
      fileName: r.fileName,
      projectCount: projectsData.length,
      committedCount: r.committedProjectIds?.length ?? 0,
      firstTitle: projectsData[0]?.title?.trim() || null,
      targetProjectId: r.targetProjectId,
      error: r.error,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });
}

export type ImportRecord = typeof documentImports.$inferSelect & {
  fileName: string | null;
};

export async function getImport(id: string): Promise<ImportRecord | null> {
  const [row] = await db
    .select({
      imp: documentImports,
      fileName: files.originalName,
    })
    .from(documentImports)
    .leftJoin(files, eq(files.id, documentImports.fileId))
    .where(eq(documentImports.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row.imp,
    extraction: row.imp.extraction
      ? normalizeExtraction(row.imp.extraction)
      : null,
    reviewed: row.imp.reviewed ? normalizeExtraction(row.imp.reviewed) : null,
    fileName: row.fileName,
  };
}
