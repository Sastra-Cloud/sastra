import "server-only";

import { revalidatePath } from "next/cache";
import { and, eq, ilike, isNull, sql } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { lineAmount } from "@/lib/budget/compute";
import { defaultProjectChannelRows } from "@/lib/chat/project-channels";
import { db } from "@/lib/db";
import {
  activityLog,
  budgetItems,
  budgetScopePresentations,
  chatChannels,
  partners,
  planTemplates,
  projectBudgetSettings,
  projectPrintSettings,
  projects,
  tasks,
  units,
} from "@/lib/db/schema";
import { insertEpisodicUnitsWithWorkflow } from "@/lib/episodes/materialize";
import { workflowProfile } from "@/lib/episodes/workflow";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { uniqueProjectSlug } from "@/lib/slug";
import { materializePlan } from "./materialize";
import {
  blueprintBudgetTotals,
  blueprintUnitNames,
  blueprintWorkflowKey,
  budgetGroupForBlueprintCategory,
  projectBlueprintSchema,
  type ProjectBlueprint,
} from "./project-blueprint";

export type CreatedProjectBlueprint = {
  id: string;
  slug: string;
  title: string;
  unitCount: number;
  taskCount: number;
  internalBudgetCents: number;
  partnerQuoteCents: number;
};

async function matchingPartnerId(name: string | undefined): Promise<string | null> {
  if (!name) return null;
  const [exact] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(sql`lower(${partners.name}) = lower(${name})`)
    .limit(1);
  if (exact) return exact.id;

  const escaped = name.replace(/[\\%_]/g, "\\$&");
  const [partial] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(ilike(partners.name, `%${escaped}%`))
    .limit(1);
  return partial?.id ?? null;
}

/**
 * Review-first assistant mutation: one approved blueprint becomes one complete
 * project, including units/workflow, budget settings, partner quote, and chat.
 * The transaction prevents a failed budget/workflow insert from leaving a
 * partial project shell behind.
 */
export async function createProjectFromBlueprint(
  raw: ProjectBlueprint
): Promise<CreatedProjectBlueprint> {
  const { user } = await requireRole("manager");
  const blueprint = projectBlueprintSchema.parse(raw);
  const [workspace, partnerId, existing] = await Promise.all([
    getWorkspaceSettings(),
    matchingPartnerId(blueprint.partnerName),
    db
      .select({ id: projects.id })
      .from(projects)
      .where(sql`lower(${projects.title}) = lower(${blueprint.title})`)
      .limit(1),
  ]);
  if (existing[0]) {
    throw new Error(
      `A project named “${blueprint.title}” already exists. Open that project or choose a different title.`
    );
  }

  const workflowKey = blueprintWorkflowKey(blueprint);
  const template = workflowKey
    ? (
        await db
          .select({ id: planTemplates.id })
          .from(planTemplates)
          .where(
            and(
              eq(planTemplates.key, workflowKey),
              eq(planTemplates.isActive, true)
            )
          )
          .limit(1)
      )[0]
    : null;
  if (workflowKey && !template) {
    throw new Error(
      `The required ${workflowKey} workflow template is unavailable. Ask an admin to restore the baseline templates.`
    );
  }

  const unitNames = blueprintUnitNames(blueprint);
  const slug = await uniqueProjectSlug(blueprint.title);
  const totals = blueprintBudgetTotals(blueprint.budgetLines);
  const deductionBps =
    blueprint.deductionPercent == null
      ? workspace.defaultFundingDeductionBps
      : Math.round(blueprint.deductionPercent * 100);

  const projectId = await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        slug,
        title: blueprint.title,
        description: blueprint.description,
        kind: blueprint.kind,
        videoProductionMode:
          blueprint.kind === "video_series"
            ? blueprint.videoProductionMode ?? "original"
            : null,
        status: blueprint.status,
        priority: blueprint.priority,
        sourceLanguage: blueprint.sourceLanguage ?? workspace.sourceLanguage,
        targetLanguage: blueprint.targetLanguage ?? workspace.targetLanguage,
        startDate: blueprint.startDate ?? null,
        dueDate: blueprint.dueDate ?? null,
        createdBy: user.id,
      })
      .returning({ id: projects.id });

    await Promise.all([
      tx.insert(projectBudgetSettings).values({
        projectId: project.id,
        wordCount: blueprint.wordCount,
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
        partnerName: blueprint.partnerName ?? null,
        partnerId,
        workDescription: blueprint.workDescription ?? null,
      }),
      tx.insert(budgetScopePresentations).values({
        projectId: project.id,
        mode: "itemized",
        deductionBps,
        publicDescription: blueprint.publicDescription ?? null,
        createdBy: user.id,
        updatedBy: user.id,
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

    if (blueprint.kind === "video_series") {
      await insertEpisodicUnitsWithWorkflow(tx, {
        projectId: project.id,
        actorId: user.id,
        profile: workflowProfile({
          kind: blueprint.kind,
          videoProductionMode: blueprint.videoProductionMode ?? "original",
          videoRequired: true,
        }),
        unitNames,
      });
    } else if (template) {
      await materializePlan(tx, {
        projectId: project.id,
        planTemplateId: template.id,
        unitNames,
        startDate: blueprint.startDate
          ? new Date(`${blueprint.startDate}T00:00:00.000Z`)
          : undefined,
        createdBy: user.id,
      });
    } else {
      await tx.insert(units).values(
        unitNames.map((name, orderIndex) => ({
          projectId: project.id,
          name,
          orderIndex,
        }))
      );
    }

    await Promise.all([
      tx.insert(chatChannels).values(defaultProjectChannelRows(project.id)),
      tx.insert(budgetItems).values(
        blueprint.budgetLines.map((line, sortOrder) => ({
          projectId: project.id,
          group: budgetGroupForBlueprintCategory(line.category),
          category: line.category,
          label: line.label,
          partnerLabel: line.partnerLabel ?? null,
          partnerUnitPrice:
            line.partnerUnitPrice == null
              ? null
              : String(line.partnerUnitPrice),
          partnerVisible: line.partnerVisible,
          sortOrder,
          unit: line.unit,
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          amount: lineAmount(line.quantity, line.unitPrice),
          isAutoQuantity:
            line.unit === "words" &&
            blueprint.wordCount > 0 &&
            line.quantity === blueprint.wordCount,
          currency: workspace.defaultCurrency,
          notes: line.notes ?? null,
        }))
      ),
      tx.insert(activityLog).values({
        actorId: user.id,
        projectId: project.id,
        entityType: "project",
        entityId: project.id,
        action: "assistant_blueprint",
        summary: `Created project “${blueprint.title}” with ${unitNames.length} units and a reviewed budget`,
        data: {
          unitCount: unitNames.length,
          internalBudgetCents: totals.internalCents,
          partnerQuoteCents: totals.partnerCents,
          partnerName: blueprint.partnerName ?? null,
        },
      }),
    ]);

    return project.id;
  });

  const [counts] = await db
    .select({
      unitCount: sql<number>`count(distinct ${units.id})::int`,
      taskCount: sql<number>`count(distinct ${tasks.id})::int`,
    })
    .from(projects)
    .leftJoin(units, eq(units.projectId, projects.id))
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(projects.id, projectId),
        isNull(tasks.printRunId)
      )
    );

  revalidatePath("/projects");
  revalidatePath(`/projects/${slug}`);

  return {
    id: projectId,
    slug,
    title: blueprint.title,
    unitCount: Number(counts?.unitCount ?? 0),
    taskCount: Number(counts?.taskCount ?? 0),
    internalBudgetCents: totals.internalCents,
    partnerQuoteCents: totals.partnerCents,
  };
}
