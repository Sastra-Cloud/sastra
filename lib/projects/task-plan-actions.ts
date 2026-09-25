"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  fileAttachments,
  files,
  phases,
  projectMembers,
  projectRoles,
  projects,
  rightsItems,
  units,
} from "@/lib/db/schema";
import { getBudgetData } from "@/lib/budget/queries";
import { presignGet } from "@/lib/r2";
import { recordR2Operation } from "@/lib/ai/usage";
import {
  aiStructured,
  aiStructuredFromDocument,
  type DocPart,
} from "@/lib/ai/openrouter";
import {
  PROPOSED_PLAN_JSON_SCHEMA,
  TASK_PLAN_SYSTEM_PROMPT,
  normalizePlan,
  renderPlanSignals,
  type ProjectPlanSignals,
} from "@/lib/ai/plan-schema";
import type { ProposedPlan } from "@/lib/ai/types";
import { materializeAiPlanIntoProject } from "@/lib/projects/materialize";
import { recomputeProjectBlockers } from "@/lib/blockers/engine";
import { logActivity } from "@/lib/activity/log";
import { getWorkspaceAiContext } from "@/lib/workspace/queries";

type Detail = "minimal" | "standard" | "detailed";
type Kind = "book" | "article" | "podcast" | "video_series" | "other";

async function gatherSignals(
  projectId: string,
  kind: Kind,
  detail: Detail
): Promise<ProjectPlanSignals> {
  const [proj] = await db
    .select({
      title: projects.title,
      description: projects.description,
      videoProductionMode: projects.videoProductionMode,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  const unitRows = await db
    .select({ name: units.name })
    .from(units)
    .where(eq(units.projectId, projectId))
    .orderBy(asc(units.orderIndex));
  const phaseRows = await db
    .select({ name: phases.name })
    .from(phases)
    .where(eq(phases.projectId, projectId));
  const [rights] = await db
    .select({
      formatPrint: rightsItems.formatPrint,
      formatEbook: rightsItems.formatEbook,
      formatAudio: rightsItems.formatAudio,
      formatVideo: rightsItems.formatVideo,
    })
    .from(rightsItems)
    .where(eq(rightsItems.projectId, projectId))
    .limit(1);
  const { settings, items } = await getBudgetData(projectId);
  const cats = new Set(items.map((i) => i.category));

  return {
    title: proj?.title ?? "Project",
    description: proj?.description ?? null,
    kind,
    videoProductionMode:
      kind === "video_series"
        ? proj?.videoProductionMode === "translation"
          ? "translation"
          : "original"
        : null,
    detail,
    chapterCount: unitRows.length,
    chapterNames: unitRows.slice(0, 60).map((u) => u.name),
    producesPrint: !!rights?.formatPrint,
    producesEbook: !!rights?.formatEbook,
    producesAudio: !!rights?.formatAudio || cats.has("audiobook"),
    producesVideo: !!rights?.formatVideo || cats.has("video_series"),
    wordCount: settings.wordCount ?? 0,
    existingPhaseNames: phaseRows.map((p) => p.name),
  };
}

export type GeneratePlanResult = { plan?: ProposedPlan; error?: string };

/** AI-generate a tailored task plan for an existing project (the wizard). */
export async function generateProjectPlan(
  projectId: string,
  opts: { kind: Kind; detail: Detail; instructions?: string }
): Promise<GeneratePlanResult> {
  const { user } = await requireRole("manager");
  try {
    const [signals, workspaceContext] = await Promise.all([
      gatherSignals(projectId, opts.kind, opts.detail),
      getWorkspaceAiContext(),
    ]);
    const userText =
      renderPlanSignals(signals) +
      (opts.instructions?.trim()
        ? `\n\nADDITIONAL INSTRUCTIONS:\n${opts.instructions.trim()}`
        : "") +
      "\n\nProduce the structured task plan now as JSON.";
    const raw = await aiStructured(
      "planner",
      [
        {
          role: "system",
          content: `${TASK_PLAN_SYSTEM_PROMPT}\n\nTRUSTED WORKSPACE CONTEXT (JSON):\n${JSON.stringify(workspaceContext)}`,
        },
        { role: "user", content: userText },
      ],
      { name: "project_plan", schema: PROPOSED_PLAN_JSON_SCHEMA },
      {
        metering: {
          scope: "workspace",
          feature: "project_plan",
          operation: "generate_project_tasks",
          actorUserId: user.id,
          projectId,
          entityType: "project",
          entityId: projectId,
          metadata: {
            kind: opts.kind,
            detail: opts.detail,
            hasInstructions: !!opts.instructions?.trim(),
          },
        },
      }
    );
    return { plan: normalizePlan(raw) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const CHAPTERS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chapters"],
  properties: {
    chapters: { type: "array", items: { type: "string" } },
  },
} as const;

const CHAPTERS_PROMPT = `Extract the ordered list of chapter / section titles from this document's table of contents (e.g. "Introduction, Chapter 1: …, Conclusion"). Return just the titles in reading order. If there is no clear chapter structure, return an empty list.`;

/** AI-extract a chapter list from the project's attached source document. */
export async function extractChaptersFromDocument(
  projectId: string
): Promise<{ chapters?: string[]; error?: string }> {
  const { user } = await requireRole("manager");
  const [att] = await db
    .select({ r2Key: files.r2Key, mime: files.mimeType, name: files.originalName })
    .from(fileAttachments)
    .innerJoin(files, eq(files.id, fileAttachments.fileId))
    .where(
      and(
        eq(fileAttachments.targetType, "project"),
        eq(fileAttachments.targetId, projectId),
        eq(files.status, "ready")
      )
    )
    .limit(1);
  if (!att) return { error: "No document attached to this project." };

  try {
    const buf = Buffer.from(
      await (await fetch(await presignGet(att.r2Key))).arrayBuffer()
    );
    await recordR2Operation({
      classType: "B",
      operationName: "GetObject",
      actorUserId: user.id,
      projectId,
      entityType: "project",
      entityId: projectId,
      metadata: { source: "extract_chapters_from_document" },
    }).catch((err) => console.error("extract_chapters R2 metering failed:", err));
    let parts: DocPart[];
    let pdf = false;
    if (att.mime === "application/pdf") {
      parts = [
        { type: "text", text: "List the chapters." },
        {
          type: "file",
          file: {
            filename: att.name,
            file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
          },
        },
      ];
      pdf = true;
    } else if (att.mime.includes("wordprocessingml")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      parts = [{ type: "text", text: value }];
    } else {
      parts = [{ type: "text", text: buf.toString("utf8") }];
    }
    const { data } = await aiStructuredFromDocument(
      "doc_import",
      CHAPTERS_PROMPT,
      parts,
      { name: "chapters", schema: CHAPTERS_SCHEMA },
      {
        pdf,
        metering: {
          scope: "workspace",
          feature: "project_plan",
          operation: "extract_chapters",
          actorUserId: user.id,
          projectId,
          entityType: "project",
          entityId: projectId,
          metadata: { mimeType: att.mime },
        },
      }
    );
    const chapters = Array.isArray((data as { chapters?: unknown }).chapters)
      ? ((data as { chapters: unknown[] }).chapters
          .map((c) => String(c).trim())
          .filter(Boolean) as string[])
      : [];
    return { chapters };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Commit a reviewed plan into the project: assign the chosen coordinators
 * (project members by role), set chapters + kind, materialize phases/tasks.
 */
export async function commitProjectPlan(
  projectId: string,
  plan: ProposedPlan,
  opts: {
    kind: Kind;
    chapters: string[];
    coordinators: Record<string, string>; // roleKey -> userId
    startDate?: string;
  }
): Promise<{ error?: string }> {
  const { user } = await requireRole("manager");
  const [proj] = await db
    .select({ slug: projects.slug, startDate: projects.startDate })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj) return { error: "Project not found." };

  const roleRows = await db
    .select({ id: projectRoles.id, key: projectRoles.key })
    .from(projectRoles);
  const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));

  const effectiveStart = opts.startDate || proj.startDate || undefined;
  const chapterNames = opts.chapters.map((c) => c.trim()).filter(Boolean);

  await db.transaction(async (tx) => {
    // Persist kind + chapters (units) if the project has none yet.
    await tx
      .update(projects)
      .set({ kind: opts.kind, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    const hasUnits =
      (
        await tx
          .select({ id: units.id })
          .from(units)
          .where(eq(units.projectId, projectId))
          .limit(1)
      ).length > 0;
    if (!hasUnits && chapterNames.length > 0) {
      await tx.insert(units).values(
        chapterNames.map((name, i) => ({ projectId, name, orderIndex: i }))
      );
    }

    // Assign coordinators (project members by role) — idempotent.
    for (const [roleKey, userId] of Object.entries(opts.coordinators)) {
      const roleId = roleIdByKey.get(roleKey);
      if (!roleId || !userId) continue;
      await tx
        .insert(projectMembers)
        .values({ projectId, userId, projectRoleId: roleId })
        .onConflictDoNothing({
          target: [
            projectMembers.projectId,
            projectMembers.userId,
            projectMembers.projectRoleId,
          ],
        });
    }

    await materializeAiPlanIntoProject(tx, {
      projectId,
      plan: { ...plan, suggestedUnits: [] },
      startDate: effectiveStart ? new Date(effectiveStart) : undefined,
      createdBy: user.id,
    });
  });

  await recomputeProjectBlockers(projectId);
  await logActivity({
    actorId: user.id,
    projectId,
    entityType: "project",
    action: "plan",
    summary: `Generated the task plan with AI`,
  });
  revalidatePath(`/projects/${proj.slug}`);
  revalidatePath(`/projects/${proj.slug}/tasks`);
  return {};
}
