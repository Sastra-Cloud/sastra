import { randomUUID } from "node:crypto";
import { z } from "zod";

import { lineAmount } from "@/lib/budget/compute";
import type { budgetItems, phases, projects, units } from "@/lib/db/schema";
import { PROJECT_OPEN_STATUSES } from "./status";

export const projectCopySchema = z.object({
  sourceProjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  status: z.enum(PROJECT_OPEN_STATUSES).default("proposal"),
  startDate: z.iso.date().optional(),
  dueDate: z.iso.date().optional(),
  copyBudget: z.boolean().default(true),
});

export type ProjectCopyInput = z.input<typeof projectCopySchema>;
export type ProjectCopyStructure = {
  project: typeof projects.$inferSelect;
  phases: (typeof phases.$inferSelect)[];
  units: (typeof units.$inferSelect)[];
  budget: (typeof budgetItems.$inferSelect)[];
};

/** Allowlist reusable structure; never spread historical records into new rows. */
export function buildProjectCopyRows(
  source: ProjectCopyStructure,
  projectId: string,
  copyBudget: boolean
) {
  const phaseIds = new Map(source.phases.map((phase) => [phase.id, randomUUID()]));
  const unitIds = new Map(source.units.map((unit) => [unit.id, randomUUID()]));

  return {
    phases: source.phases.map((phase) => ({
      id: phaseIds.get(phase.id)!, projectId,
      name: phase.name, orderIndex: phase.orderIndex, color: phase.color,
      projectRoleId: phase.projectRoleId, durationDays: phase.durationDays,
      sourcePhaseTemplateId: phase.sourcePhaseTemplateId,
    })),
    units: source.units.map((unit) => ({
      id: unitIds.get(unit.id)!, projectId,
      name: unit.name, orderIndex: unit.orderIndex,
      videoRequiredOverride: unit.videoRequiredOverride,
    })),
    budget: copyBudget ? source.budget.filter((line) => !line.printRunId).map((line) => ({
      projectId, group: line.group, category: line.category, label: line.label,
      partnerLabel: line.partnerLabel, partnerUnitPrice: line.partnerUnitPrice,
      partnerVisible: line.partnerVisible, sortOrder: line.sortOrder,
      unit: line.unit, unitPrice: line.unitPrice, currency: line.currency,
      isAutoQuantity: line.isAutoQuantity, notes: line.notes,
      quantity: line.quantity, amount: lineAmount(line.quantity, line.unitPrice),
      amountSecured: "0", amountSpent: "0",
    })) : [],
  };
}
