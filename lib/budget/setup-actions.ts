"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import {
  activityLog,
  budgetItems,
  projectBudgetSettings,
  projectPrintSettings,
} from "@/lib/db/schema";
import { findOrCreatePartnerContact } from "@/lib/partners/find-or-create";
import { DEFAULT_LANGUAGE_EXPANSION_FACTOR } from "./compute";
import { proposalCostSchema } from "./proposal-builder";
import { getOrCreateBudgetSettings } from "./queries";
import { revalidateBudget } from "./revalidate";
import {
  budgetSetupRows,
  budgetSetupSchema,
  type BudgetSetupInput,
} from "./setup";

const SETUP_ACTION = "guided_setup";

/**
 * Save a guided budget: book size, the chosen costs, and the funding partner.
 * Only for a main-project budget that has no costs yet (a printing cost from a
 * printer estimate may already exist). Nothing is emailed.
 */
export async function createGuidedBudget(
  projectId: string,
  raw: BudgetSetupInput
): Promise<{ error: string } | { ok: true }> {
  const { user } = await requireRole("manager");
  const parsed = budgetSetupSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the budget details." };
  }
  const input = parsed.data;

  try {
    const settings = await getOrCreateBudgetSettings(projectId);
    const [printSettings] = await db
      .select({ factor: projectPrintSettings.languageExpansionFactor })
      .from(projectPrintSettings)
      .where(eq(projectPrintSettings.projectId, projectId))
      .limit(1);
    const rows = budgetSetupRows(
      input,
      {
        wordsPerPage: settings.wordsPerPage,
        languageExpansionFactor:
          printSettings?.factor ?? DEFAULT_LANGUAGE_EXPANSION_FACTOR,
      },
      settings.currency
    );
    // Automatic word and page quantities must obey the same money limits.
    const overLimit = rows.find(
      (row, index) =>
        !proposalCostSchema.safeParse({
          ...input.lines[index],
          quantity: Number(row.quantity),
        }).success
    );
    if (overLimit) {
      return { error: `“${overLimit.label}” is too large. Reduce its quantity or rate.` };
    }

    const outcome = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`budget-setup:${projectId}`}))`
      );
      const [existing] = await tx
        .select({ id: budgetItems.id })
        .from(budgetItems)
        .where(
          and(
            eq(budgetItems.projectId, projectId),
            isNull(budgetItems.printRunId),
            ne(budgetItems.category, "print_ship")
          )
        )
        .limit(1);
      if (existing) {
        const [saved] = await tx
          .select({ id: activityLog.id })
          .from(activityLog)
          .where(
            and(
              eq(activityLog.projectId, projectId),
              eq(activityLog.action, SETUP_ACTION),
              eq(activityLog.entityId, input.requestId)
            )
          )
          .limit(1);
        // The same form sent twice (a lost reply): already saved.
        return saved ? "saved" : "has_costs";
      }

      const partner = input.partner;
      const link = partner ? await findOrCreatePartnerContact(tx, {
        org: partner.name, partnerId: partner.partnerId, partnerContactId: partner.contactId,
        firstName: partner.firstName, lastName: partner.lastName,
        email: partner.email, createdBy: user.id,
      }) : null;

      await tx
        .update(projectBudgetSettings)
        .set({
          wordCount: input.wordCount,
          sourcePageCount: input.sourcePageCount,
          ...(partner
            ? {
                partnerId: link!.partnerId,
                partnerContactId: link!.partnerContactId,
                partnerName: partner.name,
                partnerContactFirstName: partner.firstName || null,
                partnerContactLastName: partner.lastName || null,
                partnerContactEmail: partner.email || null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(projectBudgetSettings.projectId, projectId));
      await tx
        .insert(budgetItems)
        .values(rows.map((row) => ({ ...row, projectId })));
      await tx.insert(activityLog).values({
        actorId: user.id,
        projectId,
        entityType: "budget",
        entityId: input.requestId,
        action: SETUP_ACTION,
        summary: `Set up the budget with ${rows.length} cost${rows.length === 1 ? "" : "s"}`,
      });
      return "saved";
    });

    if (outcome === "has_costs") {
      return {
        error:
          "This budget already has costs. Reload the page to see them, then change them in Quotation.",
      };
    }
    if (input.partner) revalidatePath("/settings/partners");
    await revalidateBudget(projectId);
    return { ok: true };
  } catch {
    return {
      error:
        "Couldn’t save the budget. Your details are still here. Check your internet and try again.",
    };
  }
}
