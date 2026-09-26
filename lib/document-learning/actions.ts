"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { documentLearningCases, workspaceSettings } from "@/lib/db/schema";
import { sharedRuleSchema, suggestedSharedCues, type SharedDocumentRule } from "./shared-rules";
import { submitSharedRule } from "./cloud";

export async function setDocumentLearningEnabled(enabled: boolean) {
  await requireRole("admin");
  await db.insert(workspaceSettings).values({ id: "workspace", documentLearningEnabled: enabled })
    .onConflictDoUpdate({ target: workspaceSettings.id, set: { documentLearningEnabled: enabled } });
  revalidatePath("/settings/document-learning");
  return {};
}

export async function setDocumentCaseEnabled(caseId: string, enabled: boolean) {
  await requireRole("manager");
  await db.update(documentLearningCases).set({ enabled, updatedAt: new Date() })
    .where(eq(documentLearningCases.id, caseId));
  revalidatePath("/settings/document-learning");
  return {};
}

export async function removeDocumentCase(caseId: string) {
  await requireRole("manager");
  await db.delete(documentLearningCases).where(eq(documentLearningCases.id, caseId));
  revalidatePath("/settings/document-learning");
  return {};
}

/** Sends only the exact allowlisted payload displayed in the admin preview. */
export async function contributeDocumentCase(caseId: string, input: SharedDocumentRule) {
  await requireRole("admin");
  const rule = sharedRuleSchema.parse(input);
  const [localCase] = await db.select().from(documentLearningCases)
    .where(eq(documentLearningCases.id, caseId)).limit(1);
  if (!localCase || !localCase.enabled || localCase.workflow !== rule.workflow) {
    return { error: "Choose an active example of the same document type." };
  }
  if (localCase.cloudSubmittedAt) return { error: "This example was already submitted." };
  const cues = suggestedSharedCues(rule.workflow, `${localCase.sourceName ?? ""}\n${localCase.sourceText ?? ""}`);
  if (!cues.includes(rule.cue as never)) return { error: "The selected cue is not present in this example." };
  await submitSharedRule(rule, `document_lesson_${caseId}`);
  await db.update(documentLearningCases).set({ cloudSubmittedAt: new Date(), submittedRule: rule, updatedAt: new Date() })
    .where(eq(documentLearningCases.id, caseId));
  revalidatePath("/settings/document-learning");
  return {};
}
