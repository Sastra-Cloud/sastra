"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { defaultProjectChannelRows } from "@/lib/chat/project-channels";
import { db } from "@/lib/db";
import { aiPlanDrafts, budgetScopePresentations, chatChannels, projectBudgetSettings, projectPrintSettings, projects } from "@/lib/db/schema";
import { uniqueProjectSlug } from "@/lib/slug";
import { materializeAiPlan } from "@/lib/projects/materialize";
import { aiChat, aiStructured } from "./openrouter";
import {
  INTERVIEW_SYSTEM_PROMPT,
  PLAN_SYSTEM_PROMPT,
  PROPOSED_PLAN_JSON_SCHEMA,
  normalizePlan,
} from "./plan-schema";
import type { ConversationMessage, ProposedPlan } from "./types";
import { getWorkspaceAiContext, getWorkspaceSettings } from "@/lib/workspace/queries";

const GREETING =
  "Hi! I'll help you plan a publishing project. What are we working on — a book or an article, and what's it about?";

export async function createDraft() {
  const { user } = await requireRole("manager");
  const [draft] = await db
    .insert(aiPlanDrafts)
    .values({
      createdBy: user.id,
      status: "interviewing",
      conversation: [{ role: "assistant", content: GREETING }],
    })
    .returning({ id: aiPlanDrafts.id });
  redirect(`/projects/plan/${draft.id}`);
}

export type InterviewResult = { reply?: string; error?: string };

export async function sendInterview(
  draftId: string,
  userText: string
): Promise<InterviewResult> {
  const { user } = await requireRole("manager");
  const text = userText.trim();
  if (!text) return { error: "Say something first." };

  const [draft] = await db
    .select()
    .from(aiPlanDrafts)
    .where(eq(aiPlanDrafts.id, draftId))
    .limit(1);
  if (!draft) return { error: "Draft not found." };
  const workspaceContext = await getWorkspaceAiContext();

  const convo: ConversationMessage[] = [
    ...draft.conversation,
    { role: "user", content: text },
  ];
  try {
    const reply = await aiChat("planner", [
      { role: "system", content: `${INTERVIEW_SYSTEM_PROMPT}\n\nTRUSTED WORKSPACE CONTEXT (JSON):\n${JSON.stringify(workspaceContext)}` },
      ...convo,
    ], {
      metering: {
        scope: "workspace",
        feature: "planner",
        operation: "interview_reply",
        actorUserId: user.id,
        projectId: draft.projectId,
        entityType: "ai_plan_draft",
        entityId: draftId,
      },
    });
    const updated: ConversationMessage[] = [
      ...convo,
      { role: "assistant", content: reply },
    ];
    await db
      .update(aiPlanDrafts)
      .set({ conversation: updated, updatedAt: new Date() })
      .where(eq(aiPlanDrafts.id, draftId));
    revalidatePath(`/projects/plan/${draftId}`);
    return { reply };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export type GenerateResult = { plan?: ProposedPlan; error?: string };

export async function generatePlan(draftId: string): Promise<GenerateResult> {
  const { user } = await requireRole("manager");
  const [draft] = await db
    .select()
    .from(aiPlanDrafts)
    .where(eq(aiPlanDrafts.id, draftId))
    .limit(1);
  if (!draft) return { error: "Draft not found." };
  const workspaceContext = await getWorkspaceAiContext();

  try {
    const raw = await aiStructured(
      "planner",
      [
        { role: "system", content: `${PLAN_SYSTEM_PROMPT}\n\nTRUSTED WORKSPACE CONTEXT (JSON):\n${JSON.stringify(workspaceContext)}` },
        ...draft.conversation,
        {
          role: "user",
          content: "Produce the structured project plan now as JSON.",
        },
      ],
      { name: "project_plan", schema: PROPOSED_PLAN_JSON_SCHEMA },
      {
        metering: {
          scope: "workspace",
          feature: "planner",
          operation: "generate_plan",
          actorUserId: user.id,
          projectId: draft.projectId,
          entityType: "ai_plan_draft",
          entityId: draftId,
        },
      }
    );
    const plan = normalizePlan(raw);
    await db
      .update(aiPlanDrafts)
      .set({ proposedPlan: plan, status: "ready", updatedAt: new Date() })
      .where(eq(aiPlanDrafts.id, draftId));
    revalidatePath(`/projects/plan/${draftId}`);
    return { plan };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function saveDraftPlan(draftId: string, plan: ProposedPlan) {
  await requireRole("manager");
  await db
    .update(aiPlanDrafts)
    .set({ proposedPlan: plan, status: "ready", updatedAt: new Date() })
    .where(eq(aiPlanDrafts.id, draftId));
}

export async function commitPlan(
  draftId: string,
  plan: ProposedPlan,
  startDate?: string
) {
  const { user } = await requireRole("manager");
  if (!plan.projectTitle?.trim()) return;

  const slug = await uniqueProjectSlug(plan.projectTitle);
  const workspace = await getWorkspaceSettings();
  await db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        slug,
        title: plan.projectTitle,
        description: plan.summary ?? null,
        status: "planning",
        priority: "medium",
        sourceLanguage: workspace.sourceLanguage,
        targetLanguage: workspace.targetLanguage,
        startDate: startDate || null,
        createdBy: user.id,
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
      tx.insert(projectPrintSettings).values({
        projectId: project.id,
        trimWidthIn: workspace.trimWidthIn,
        trimHeightIn: workspace.trimHeightIn,
        languageExpansionFactor: workspace.languageExpansionFactor,
        financialEmail: workspace.financialEmail ?? "",
        ccEmails: workspace.defaultCcEmails,
      }),
      tx.insert(budgetScopePresentations).values({
        projectId: project.id,
        mode: "itemized",
        deductionBps: workspace.defaultFundingDeductionBps,
        createdBy: user.id,
        updatedBy: user.id,
      }),
    ]);

    await materializeAiPlan(tx, {
      projectId: project.id,
      plan,
      startDate: startDate ? new Date(startDate) : undefined,
      createdBy: user.id,
    });

    await tx.insert(chatChannels).values(defaultProjectChannelRows(project.id));

    await tx
      .update(aiPlanDrafts)
      .set({
        status: "committed",
        projectId: project.id,
        proposedPlan: plan,
        committedAt: new Date(),
      })
      .where(eq(aiPlanDrafts.id, draftId));
  });

  revalidatePath("/projects");
  redirect(`/projects/${slug}`);
}
