import "server-only";

import { and, desc, eq, exists, isNotNull, isNull, ne, or } from "drizzle-orm";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { printQuotes, printRuns, projects } from "@/lib/db/schema";
import { bookSpecPresets } from "./spec-presets";

export async function listBookSpecPresets() {
  await requireRole("manager");
  const rows = await db.select({
    id: printRuns.id,
    projectId: projects.id,
    projectTitle: projects.title,
    runTitle: printRuns.title,
    trimWidthIn: printRuns.trimWidthIn,
    trimHeightIn: printRuns.trimHeightIn,
    textPaper: printRuns.textPaper,
    coverPaper: printRuns.coverPaper,
    binding: printRuns.binding,
  }).from(printRuns)
    .innerJoin(projects, eq(projects.id, printRuns.projectId))
    .where(and(
      or(eq(projects.kind, "book"), isNull(projects.kind)),
      ne(printRuns.kind, "budget_estimate"),
      ne(printRuns.status, "cancelled"),
      // Captured email can create an unreviewed run. Only reuse manager-created,
      // completed, or accepted production work as a suggested specification.
      or(isNotNull(printRuns.createdBy), eq(printRuns.status, "completed"), exists(
        db.select({ id: printQuotes.id }).from(printQuotes).where(and(
          eq(printQuotes.runId, printRuns.id), eq(printQuotes.reviewStatus, "accepted"),
        )),
      )),
    ))
    .orderBy(desc(printRuns.updatedAt), desc(printRuns.createdAt));
  return bookSpecPresets(rows);
}
