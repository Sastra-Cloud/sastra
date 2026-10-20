"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { budgetItems, budgetScopePresentations } from "@/lib/db/schema";
import { grossTargetCents, partnerQuoteTotalCents, suggestPartnerRates, sumAmountCents } from "./compute";
import { applyPartnerRates, type PartnerRateChange, type PartnerRateResult } from "./partner-line-state";
import { revalidateBudget } from "./revalidate";

const scopeSchema = z.object({ projectId: z.uuid(), printRunId: z.uuid().nullable() });
const rateSchema = z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/);
const changesSchema = z.array(z.object({
  id: z.uuid(),
  previousPartnerUnitPrice: rateSchema.nullable(),
  appliedPartnerUnitPrice: rateSchema,
})).min(1).max(500).refine((changes) => new Set(changes.map((change) => change.id)).size === changes.length);

function scopeFilter(table: typeof budgetItems | typeof budgetScopePresentations, projectId: string, printRunId: string | null) {
  return and(eq(table.projectId, projectId), printRunId ? eq(table.printRunId, printRunId) : isNull(table.printRunId));
}

/** Save the exact previous overrides in the result, including inherited rates. */
export async function applySuggestedPartnerRates(projectId: string, printRunId: string | null, selectedIds: string[]): Promise<PartnerRateResult> {
  await requireRole("manager");
  try {
    scopeSchema.parse({ projectId, printRunId });
    z.array(z.uuid()).min(1).max(500).parse(selectedIds);
    const result = await db.transaction(async (tx) => {
      const [presentation] = await tx.select().from(budgetScopePresentations)
        .where(scopeFilter(budgetScopePresentations, projectId, printRunId)).for("update");
      if (!presentation) throw new Error("Set up the partner quote first.");
      const items = await tx.select().from(budgetItems)
        .where(scopeFilter(budgetItems, projectId, printRunId)).orderBy(budgetItems.id).for("update");
      const rates = suggestPartnerRates(items, new Set(selectedIds), presentation.deductionBps);
      if (partnerQuoteTotalCents(applyPartnerRates(items, rates)) < grossTargetCents(sumAmountCents(items), presentation.deductionBps)) {
        throw new Error("The suggested rates did not fully cover the funding target. No rates were changed.");
      }
      const changes: PartnerRateChange[] = [];
      for (const item of items) {
        if (!Object.hasOwn(rates, item.id)) continue;
        if (item.partnerUnitPrice != null && Number(item.partnerUnitPrice) === Number(rates[item.id])) {
          rates[item.id] = item.partnerUnitPrice;
          continue;
        }
        const [saved] = await tx.update(budgetItems).set({ partnerUnitPrice: rates[item.id], updatedAt: new Date() })
          .where(eq(budgetItems.id, item.id)).returning({ partnerUnitPrice: budgetItems.partnerUnitPrice });
        rates[item.id] = saved.partnerUnitPrice!;
        changes.push({ id: item.id, previousPartnerUnitPrice: item.partnerUnitPrice, appliedPartnerUnitPrice: rates[item.id] });
      }
      return { rates, changes };
    });
    await revalidateBudget(projectId);
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not apply the funding target." };
  }
}

/** Restore the last application atomically, without overwriting later rate edits. */
export async function undoSuggestedPartnerRates(projectId: string, printRunId: string | null, input: PartnerRateChange[]): Promise<PartnerRateResult> {
  await requireRole("manager");
  try {
    scopeSchema.parse({ projectId, printRunId });
    const changes = changesSchema.parse(input);
    const rates = await db.transaction(async (tx) => {
      const items = await tx.select().from(budgetItems)
        .where(scopeFilter(budgetItems, projectId, printRunId)).orderBy(budgetItems.id).for("update");
      const byId = new Map(items.map((item) => [item.id, item]));
      // Validate every row before writing any: a conflict must never leave a partial undo.
      for (const change of changes) {
        const item = byId.get(change.id);
        if (!item || item.partnerUnitPrice == null || Number(item.partnerUnitPrice) !== Number(change.appliedPartnerUnitPrice)) {
          throw new Error("These partner rates changed after the funding target was applied. Undo was not saved. Refresh and review the current rates.");
        }
      }
      const restored: Record<string, string | null> = {};
      for (const change of changes) {
        const [saved] = await tx.update(budgetItems).set({ partnerUnitPrice: change.previousPartnerUnitPrice, updatedAt: new Date() })
          .where(eq(budgetItems.id, change.id)).returning({ partnerUnitPrice: budgetItems.partnerUnitPrice });
        restored[change.id] = saved.partnerUnitPrice;
      }
      return restored;
    });
    await revalidateBudget(projectId);
    return { rates, changes: [] };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not undo the funding target." };
  }
}
