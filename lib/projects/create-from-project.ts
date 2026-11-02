import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import { lineAmount } from "@/lib/budget/compute";
import { defaultProjectChannelRows } from "@/lib/chat/project-channels";
import { db, type Db } from "@/lib/db";
import {
  activityLog, budgetItems, budgetScopePresentations, chatChannels, phases,
  podcastStageSettings, projectBudgetSettings, projectPrintSettings, projects, units,
} from "@/lib/db/schema";
import { uniqueProjectSlug } from "@/lib/slug";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { buildProjectCopyRows, projectCopySchema, type ProjectCopyInput } from "./project-copy";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function loadSource(reader: Db | Tx, sourceProjectId: string, copyBudget: boolean) {
  const [project] = await reader.select().from(projects).where(eq(projects.id, sourceProjectId)).limit(1);
  if (!project) throw new Error("The source project no longer exists. Choose an existing project.");
  const [sourcePhases, sourceUnits, budget, settings, presentation, printSettings, stageSettings] = await Promise.all([
    reader.select().from(phases).where(eq(phases.projectId, project.id)).orderBy(asc(phases.orderIndex), asc(phases.id)),
    reader.select().from(units).where(eq(units.projectId, project.id)).orderBy(asc(units.orderIndex), asc(units.id)),
    copyBudget ? reader.select().from(budgetItems).where(and(eq(budgetItems.projectId, project.id), isNull(budgetItems.printRunId))).orderBy(asc(budgetItems.sortOrder), asc(budgetItems.id)) : [],
    copyBudget ? reader.select().from(projectBudgetSettings).where(eq(projectBudgetSettings.projectId, project.id)).limit(1) : [],
    copyBudget ? reader.select().from(budgetScopePresentations).where(and(eq(budgetScopePresentations.projectId, project.id), isNull(budgetScopePresentations.printRunId))).limit(1) : [],
    reader.select().from(projectPrintSettings).where(eq(projectPrintSettings.projectId, project.id)).limit(1),
    reader.select().from(podcastStageSettings).where(eq(podcastStageSettings.projectId, project.id)).orderBy(asc(podcastStageSettings.stage)),
  ]);
  return { project, phases: sourcePhases, units: sourceUnits, budget,
    settings: settings[0], presentation: presentation[0], printSettings: printSettings[0], stageSettings };
}

function fingerprint(source: Awaited<ReturnType<typeof loadSource>>, workspace: Awaited<ReturnType<typeof getWorkspaceSettings>>) {
  return createHash("sha256").update(JSON.stringify({ source, workspace })).digest("hex");
}

export async function previewProjectFromExisting(raw: ProjectCopyInput) {
  await requireRole("manager");
  const input = projectCopySchema.parse(raw);
  const [source, workspace] = await Promise.all([
    loadSource(db, input.sourceProjectId, input.copyBudget), getWorkspaceSettings(),
  ]);
  return {
    fingerprint: fingerprint(source, workspace),
    description: [
      `Create project “${input.title}” based on “${source.project.title}”`,
      ...((input.description ?? source.project.description) ? [input.description ?? source.project.description!] : []),
      `${source.project.kind ?? "book"} · ${source.project.sourceLanguage || workspace.sourceLanguage} → ${source.project.targetLanguage || workspace.targetLanguage} · ${input.status}`,
      `${source.phases.length} phases · ${source.units.length} units with the same names · no tasks or people assigned`,
      input.copyBudget ? `${source.budget.length} budget lines: copy quantities, rates, and quote settings as estimates for review; reset funding and spending to zero.` : "No budget lines copied.",
      ...source.budget.map((line) => `${line.label}: ${line.quantity} ${line.unit} × ${line.unitPrice} = ${line.currency} ${lineAmount(line.quantity, line.unitPrice)}${line.partnerUnitPrice != null ? ` · partner rate ${line.partnerUnitPrice}` : ""}${line.partnerVisible ? "" : " · hidden from partner"}`),
      ...(source.settings?.partnerName ? [`Partner: ${source.settings.partnerName}`] : []),
      `Priority: ${source.project.priority} · MoU required: ${source.project.mouRequired ? "yes" : "no"} · royalties: ${source.project.requiresRoyalties ? `${source.project.royaltyPercentage ?? "unset"}% (review for new project)` : "not required"}`,
      "Reuse production defaults and print settings. Partner and royalty payment settings are copied when budget reuse is included; no payments or emails are sent.",
      `Dates: ${input.startDate ?? "start not set"} · ${input.dueDate ?? "due not set"}`,
      "Old tasks, assignments, completion, dates, signed agreements, approvals, payments, files, and messages are not copied.",
    ].join("\n"),
  };
}

/** One approved action creates the entire fresh setup, or rolls it all back. */
export async function createProjectFromExisting(raw: ProjectCopyInput, reviewedFingerprint: string) {
  const { user } = await requireRole("manager");
  const input = projectCopySchema.parse(raw);
  const workspace = await getWorkspaceSettings();
  const slug = await uniqueProjectSlug(input.title);
  const id = randomUUID();
  const result = await db.transaction(async (tx) => {
    const source = await loadSource(tx, input.sourceProjectId, input.copyBudget);
    if (!reviewedFingerprint || fingerprint(source, workspace) !== reviewedFingerprint) {
      throw new Error("The source setup changed. Request a fresh project preview before approving again.");
    }
    const [existing] = await tx.select({ id: projects.id }).from(projects)
      .where(sql`lower(trim(${projects.title})) = lower(${input.title})`).limit(1);
    if (existing) throw new Error("A project with that title already exists. Open it or choose a different title.");
    const rows = buildProjectCopyRows(source, id, input.copyBudget);
    await tx.insert(projects).values({
      id, slug, title: input.title, description: input.description ?? source.project.description,
      kind: source.project.kind, videoProductionMode: source.project.videoProductionMode,
      videoRequired: source.project.videoRequired,
      sourceLanguage: source.project.sourceLanguage || workspace.sourceLanguage,
      targetLanguage: source.project.targetLanguage || workspace.targetLanguage,
      estimatedDurationMonths: source.project.estimatedDurationMonths,
      priority: source.project.priority,
      mouRequired: source.project.mouRequired,
      requiresRoyalties: source.project.requiresRoyalties,
      royaltyPercentage: source.project.royaltyPercentage,
      printFundingStatus: source.project.printFundingStatus === "not_required" ? "not_required" : "not_assessed",
      status: input.status, startDate: input.startDate ?? null, dueDate: input.dueDate ?? null,
      createdBy: user.id,
    });
    const settings = source.settings;
    await tx.insert(projectBudgetSettings).values({
      projectId: id, wordsPerPage: settings?.wordsPerPage ?? workspace.wordsPerPage,
      currency: settings?.currency ?? workspace.defaultCurrency,
      rateTranslation: settings?.rateTranslation ?? workspace.rateTranslation,
      rateProofreading: settings?.rateProofreading ?? workspace.rateProofreading,
      rateEditing: settings?.rateEditing ?? workspace.rateEditing,
      rateCoverDesign: settings?.rateCoverDesign ?? workspace.rateCoverDesign,
      rateTypesetting: settings?.rateTypesetting ?? workspace.rateTypesetting,
      rateProjectManagement: settings?.rateProjectManagement ?? workspace.rateProjectManagement,
      ratePrintShip: settings?.ratePrintShip ?? workspace.ratePrintShip,
      rateAudiobook: settings?.rateAudiobook ?? workspace.rateAudiobook,
      rateVideoSeries: settings?.rateVideoSeries ?? workspace.rateVideoSeries,
      wordCount: settings?.wordCount ?? 0, sourcePageCount: settings?.sourcePageCount ?? 0,
      partnerId: settings?.partnerId, partnerName: settings?.partnerName,
      partnerContactId: settings?.partnerContactId, partnerContact: settings?.partnerContact,
      partnerContactFirstName: settings?.partnerContactFirstName,
      partnerContactLastName: settings?.partnerContactLastName,
      partnerContactEmail: settings?.partnerContactEmail,
      workDescription: settings?.workDescription,
      royaltyRecipientEmail: settings?.royaltyRecipientEmail,
      royaltyDueMonth: settings?.royaltyDueMonth, royaltyDueDay: settings?.royaltyDueDay,
      royaltyFrequency: settings?.royaltyFrequency, royaltyAmount: settings?.royaltyAmount,
      royaltyCurrency: settings?.royaltyCurrency,
    });
    const presentation = source.presentation;
    await tx.insert(budgetScopePresentations).values({
      projectId: id, mode: presentation?.mode ?? "itemized",
      deductionBps: presentation?.deductionBps ?? workspace.defaultFundingDeductionBps,
      publicDescription: presentation?.publicDescription,
      perCopyQuantity: presentation?.perCopyQuantity, perCopyUnitPrice: presentation?.perCopyUnitPrice,
      createdBy: user.id, updatedBy: user.id,
    });
    const printSettings = source.printSettings;
    await tx.insert(projectPrintSettings).values({
      projectId: id, defaultContactId: printSettings?.defaultContactId,
      trimWidthIn: printSettings?.trimWidthIn ?? workspace.trimWidthIn,
      trimHeightIn: printSettings?.trimHeightIn ?? workspace.trimHeightIn,
      measurementUnit: printSettings?.measurementUnit,
      languageExpansionFactor: printSettings?.languageExpansionFactor ?? workspace.languageExpansionFactor,
      financialEmail: printSettings?.financialEmail ?? workspace.financialEmail ?? "",
      ccEmails: printSettings?.ccEmails ?? workspace.defaultCcEmails,
    });
    if (rows.phases.length) await tx.insert(phases).values(rows.phases);
    if (rows.units.length) await tx.insert(units).values(rows.units);
    if (source.stageSettings.length) await tx.insert(podcastStageSettings).values(source.stageSettings.map((stage) => ({
      projectId: id, stage: stage.stage, daysBeforePublication: stage.daysBeforePublication,
    })));
    if (rows.budget.length) await tx.insert(budgetItems).values(rows.budget);
    await tx.insert(chatChannels).values(defaultProjectChannelRows(id));
    await tx.insert(activityLog).values({
      actorId: user.id, projectId: id, entityType: "project", entityId: id,
      action: "assistant_copy", summary: `Created project “${input.title}” based on “${source.project.title}”`,
      data: { sourceProjectId: source.project.id },
    });
    return { projectId: id, title: input.title, slug, url: `/projects/${slug}`, status: input.status,
      taskCount: 0, unitCount: rows.units.length, budgetLineCount: rows.budget.length,
      budgetCopiedAsEstimate: rows.budget.length > 0 };
  });
  revalidatePath("/projects");
  revalidatePath(result.url);
  return result;
}
