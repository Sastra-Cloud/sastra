"use server";

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { activityLog, budgetItems, projectBudgetSettings, projectPrintSettings, projects } from "@/lib/db/schema";
import { createProjectInTransaction, createProjectSchema } from "@/lib/projects/create";
import { uniqueProjectSlug } from "@/lib/slug";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { groupForCategory } from "./compute";
import { proposalBudgetSchema, proposalCostRows, type ProposalBudgetInput } from "./proposal-builder";

export async function createProposalBudget(raw: ProposalBudgetInput): Promise<{ error: string } | { projectId: string; url: string }> {
  const { user } = await requireRole("manager");
  const parsed = proposalBudgetSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the proposal details." };
  const input = parsed.data;
  const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  try {
    const workspace = await getWorkspaceSettings();
    const slug = await uniqueProjectSlug(input.title);
    const rows = proposalCostRows(input, input);
    // Revalidate derived quantities, too: automatic word/page quantities must obey money bounds.
    const checked = proposalBudgetSchema.safeParse({ ...input, lines: rows });
    if (!checked.success) return { error: checked.error.issues[0]?.message ?? "Check the estimated quantities and rates." };
    const result = await db.transaction(async tx => {
      // Stable client request IDs make a retry after a lost response safe.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`proposal-budget:${input.requestId}`}))`);
      const [existing] = await tx.select({ id: projects.id, slug: projects.slug }).from(projects).where(eq(projects.id, input.requestId));
      if (existing) {
        const [creation] = await tx.select({ data: activityLog.data }).from(activityLog).where(and(eq(activityLog.projectId, existing.id), eq(activityLog.actorId, user.id), eq(activityLog.action, "proposal_budget_created"))).limit(1);
        if ((creation?.data as { fingerprint?: unknown } | null)?.fingerprint !== fingerprint) throw new Error("draft_already_saved");
        return { projectId: existing.id, url: `/projects/${existing.slug}/budget` };
      }
      const project = await createProjectInTransaction(tx, {
        projectId: input.requestId,
        data: createProjectSchema.parse({ title: input.title, description: input.description, kind: input.kind,
          status: "proposal", planTemplateId: "none", sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage }),
        slug, workspace, actorId: user.id,
      });
      await tx.update(projectBudgetSettings).set({ wordCount: input.wordCount, sourcePageCount: input.sourcePageCount, wordsPerPage: input.wordsPerPage, currency: input.currency }).where(eq(projectBudgetSettings.projectId, project.id));
      await tx.update(projectPrintSettings).set({ languageExpansionFactor: input.languageExpansionFactor }).where(eq(projectPrintSettings.projectId, project.id));
      await tx.insert(budgetItems).values(rows.map((line, sortOrder) => ({
        projectId: project.id, group: groupForCategory(line.category), category: line.category,
        label: line.label, unit: line.unit, quantity: line.quantity.toFixed(2), unitPrice: line.unitPrice.toFixed(4),
        amount: line.amount, currency: input.currency, isAutoQuantity: line.autoQuantity,
        amountSecured: "0", amountSpent: "0", partnerVisible: true, sortOrder,
      })));
      await tx.insert(activityLog).values({ actorId: user.id, projectId: project.id, entityType: "project", entityId: project.id,
        action: "proposal_budget_created", summary: `Created proposal budget for “${input.title}”`, data: { fingerprint } });
      return { projectId: project.id, url: `/projects/${slug}/budget` };
    });
    revalidatePath("/projects");
    revalidatePath(result.url);
    return result;
  } catch (error) {
    return { error: error instanceof Error && error.message === "draft_already_saved"
      ? "This draft was already saved with different details. Open the saved proposal or start a new budget."
      : "Could not save the proposal budget. Your details are still here; check your connection and try again." };
  }
}
