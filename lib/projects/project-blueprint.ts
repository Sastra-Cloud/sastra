import { z } from "zod";

import {
  lineAmount,
  lineAmountCents,
  partnerQuoteTotalCents,
  type BudgetCategory,
  type BudgetGroup,
  type BudgetUnit,
} from "@/lib/budget/compute";
import { PROJECT_OPEN_STATUSES } from "./status";

const projectKindSchema = z.enum([
  "book",
  "article",
  "podcast",
  "video_series",
  "other",
]);

const budgetCategorySchema = z.enum([
  "translation",
  "proofreading",
  "editing",
  "cover_design",
  "typesetting",
  "project_management",
  "print_ship",
  "audiobook",
  "video_series",
  "custom",
]);

const budgetUnitSchema = z.enum([
  "words",
  "pages",
  "cover",
  "project",
  "flat",
]);

export const projectBlueprintBudgetLineSchema = z.object({
  label: z.string().trim().min(1).max(200),
  category: budgetCategorySchema,
  unit: budgetUnitSchema,
  quantity: z.number().finite().positive().max(100_000_000),
  unitPrice: z.number().finite().min(0).max(1_000_000),
  partnerLabel: z.string().trim().min(1).max(200).optional(),
  partnerUnitPrice: z.number().finite().min(0).max(1_000_000).optional(),
  partnerVisible: z.boolean().optional().default(true),
  notes: z.string().trim().max(2_000).optional(),
});

export const projectBlueprintSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).optional(),
    kind: projectKindSchema,
    status: z.enum(PROJECT_OPEN_STATUSES).optional().default("proposal"),
    videoProductionMode: z.enum(["original", "translation"]).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional().default("medium"),
    sourceLanguage: z.string().trim().min(1).max(100).optional(),
    targetLanguage: z.string().trim().min(1).max(100).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    unitCount: z.number().int().min(1).max(500),
    unitName: z.string().trim().min(1).max(80).optional(),
    unitTitles: z.array(z.string().trim().min(1).max(200)).max(500).optional(),
    workflow: z
      .enum(["article_translation", "article_av"])
      .optional(),
    partnerName: z.string().trim().min(1).max(200).optional(),
    workDescription: z.string().trim().max(2_000).optional(),
    wordCount: z.number().int().min(0).max(100_000_000).optional().default(0),
    deductionPercent: z.number().finite().min(0).max(99.99).optional(),
    publicDescription: z.string().trim().max(1_000).optional(),
    budgetLines: z.array(projectBlueprintBudgetLineSchema).min(1).max(30),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "video_series" && value.videoProductionMode) {
      ctx.addIssue({
        code: "custom",
        path: ["videoProductionMode"],
        message: "Video production mode is only valid for a video-series project.",
      });
    }
    if (value.unitTitles && value.unitTitles.length !== value.unitCount) {
      ctx.addIssue({
        code: "custom",
        path: ["unitTitles"],
        message: "Unit titles must contain exactly unitCount entries.",
      });
    }
    if (value.workflow && value.kind !== "article") {
      ctx.addIssue({
        code: "custom",
        path: ["workflow"],
        message: "Article workflows are only valid for article projects.",
      });
    }
  });

export type ProjectBlueprint = z.infer<typeof projectBlueprintSchema>;
export type ProjectBlueprintBudgetLine = z.infer<
  typeof projectBlueprintBudgetLineSchema
>;

export function budgetGroupForBlueprintCategory(
  category: BudgetCategory
): BudgetGroup {
  return category === "audiobook" || category === "video_series"
    ? "additional_media"
    : "book_publishing";
}

export function blueprintUnitNames(
  blueprint: Pick<
    ProjectBlueprint,
    "kind" | "unitCount" | "unitName" | "unitTitles"
  >
): string[] {
  if (blueprint.unitTitles?.length) return blueprint.unitTitles;
  const fallback =
    blueprint.kind === "article"
      ? "Article"
      : blueprint.kind === "video_series"
        ? "Video"
        : blueprint.kind === "podcast"
          ? "Episode"
          : blueprint.kind === "book"
            ? "Chapter"
            : "Unit";
  const prefix = blueprint.unitName?.trim() || fallback;
  return Array.from(
    { length: blueprint.unitCount },
    (_, index) => `${prefix} ${index + 1}`
  );
}

export function blueprintWorkflowKey(
  blueprint: Pick<ProjectBlueprint, "kind" | "workflow">
): string | null {
  if (blueprint.kind !== "article") return null;
  return blueprint.workflow === "article_av"
    ? "article-av"
    : "article-translation";
}

export function blueprintBudgetTotals(
  lines: ReadonlyArray<ProjectBlueprintBudgetLine>
): { internalCents: number; partnerCents: number } {
  const internalCents = lines.reduce(
    (sum, line) => sum + lineAmountCents(line.quantity, line.unitPrice),
    0
  );
  const partnerCents = partnerQuoteTotalCents(
    lines.map((line, index) => ({
      id: String(index),
      unit: line.unit as BudgetUnit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: lineAmount(line.quantity, line.unitPrice),
      partnerVisible: line.partnerVisible,
      partnerUnitPrice: line.partnerUnitPrice,
    }))
  );
  return { internalCents, partnerCents };
}
