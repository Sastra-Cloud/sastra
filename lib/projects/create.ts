import "server-only";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { projects, projectBudgetSettings, budgetScopePresentations, projectPrintSettings, units, chatChannels } from "@/lib/db/schema";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { defaultProjectChannelRows } from "@/lib/chat/project-channels";
import { materializePlan } from "./materialize";
import { insertEpisodicUnitsWithWorkflow } from "@/lib/episodes/materialize";
import { workflowProfile } from "@/lib/episodes/workflow";
import { isEpisodicKind } from "./kinds";
import { PRINT_FUNDING_STATUSES } from "./print-funding";
import { PROJECT_OPEN_STATUSES } from "./status";

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().optional(),
  status: z
    .enum(PROJECT_OPEN_STATUSES)
    .default("planning"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  kind: z.enum(["book", "article", "podcast", "video_series", "other"]).optional(),
  printFundingStatus: z.enum(PRINT_FUNDING_STATUSES).default("not_assessed"),
  videoProductionMode: z.enum(["original", "translation"]).default("original"),
  sourceLanguage: z.string().trim().max(100).optional(),
  targetLanguage: z.string().trim().max(100).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  planTemplateId: z.string().optional(),
  chapters: z.string().optional(),
});

/** Shared native/connected creation. Caller validates the input and authorizes the actor. */
export async function createProjectInTransaction(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], { data, slug, workspace, actorId }: {
  data: z.infer<typeof createProjectSchema>; slug: string; workspace: Awaited<ReturnType<typeof getWorkspaceSettings>>; actorId: string;
}) {
  const planTemplateId =
    data.planTemplateId && data.planTemplateId !== "none"
      ? data.planTemplateId
      : undefined;
  const unitNames = data.chapters
    ? data.chapters.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    : [];

    const [project] = await tx
      .insert(projects)
      .values({
        slug,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        kind: data.kind ?? null,
        printFundingStatus: data.printFundingStatus,
        videoProductionMode:
          data.kind === "video_series" ? data.videoProductionMode : null,
        sourceLanguage: data.sourceLanguage || workspace.sourceLanguage,
        targetLanguage: data.targetLanguage || workspace.targetLanguage,
        startDate: data.startDate || null,
        dueDate: data.dueDate || null,
        createdBy: actorId,
      })
      .returning({ id: projects.id });

    await Promise.all([
      tx.insert(projectBudgetSettings).values({
        projectId: project.id,
        wordsPerPage: workspace.wordsPerPage,
        currency: workspace.defaultCurrency,
        rateTranslation: workspace.rateTranslation,
        rateProofreading: workspace.rateProofreading,
        rateEditing: workspace.rateEditing,
        rateCoverDesign: workspace.rateCoverDesign,
        rateTypesetting: workspace.rateTypesetting,
        rateProjectManagement: workspace.rateProjectManagement,
        ratePrintShip: workspace.ratePrintShip,
        rateAudiobook: workspace.rateAudiobook,
        rateVideoSeries: workspace.rateVideoSeries,
      }),
      tx.insert(budgetScopePresentations).values({
        projectId: project.id,
        mode: "itemized",
        deductionBps: workspace.defaultFundingDeductionBps,
        createdBy: actorId,
        updatedBy: actorId,
      }),
      tx.insert(projectPrintSettings).values({
        projectId: project.id,
        trimWidthIn: workspace.trimWidthIn,
        trimHeightIn: workspace.trimHeightIn,
        languageExpansionFactor: workspace.languageExpansionFactor,
        financialEmail: workspace.financialEmail ?? "",
        ccEmails: workspace.defaultCcEmails,
      }),
    ]);

    if (isEpisodicKind(data.kind) && unitNames.length > 0) {
      await insertEpisodicUnitsWithWorkflow(tx, {
        projectId: project.id,
        actorId: actorId,
        profile: workflowProfile({
          kind: data.kind,
          videoProductionMode: data.videoProductionMode,
          videoRequired: true,
        }),
        unitNames,
      });
    } else if (planTemplateId) {
      await materializePlan(tx, {
        projectId: project.id,
        planTemplateId,
        unitNames,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        createdBy: actorId,
      });
    } else if (unitNames.length > 0) {
      await tx.insert(units).values(
        unitNames.map((name, orderIndex) => ({
          projectId: project.id,
          name,
          orderIndex,
        }))
      );
    }

    // Every project gets subject channels so decisions do not get lost.
    await tx.insert(chatChannels).values(defaultProjectChannelRows(project.id));
  return project;
}
