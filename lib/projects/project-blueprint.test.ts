import { describe, expect, it } from "vitest";

import {
  blueprintBudgetTotals,
  blueprintUnitNames,
  projectBlueprintSchema,
} from "./project-blueprint";

describe("project blueprints", () => {
  it("builds a 52-video batch and preserves the $50 public unit cost", () => {
    const blueprint = projectBlueprintSchema.parse({
      title: "Desiring God — 52 Article Talking Head Videos",
      kind: "video_series",
      videoProductionMode: "original",
      unitCount: 52,
      unitName: "Video",
      partnerName: "Desiring God",
      budgetLines: [
        {
          label: "Source selection and article-link mapping",
          category: "video_series",
          unit: "flat",
          quantity: 52,
          unitPrice: 2.61,
          partnerUnitPrice: 3,
        },
        {
          label: "Article distillation and short script",
          category: "video_series",
          unit: "flat",
          quantity: 52,
          unitPrice: 8.7,
          partnerUnitPrice: 10,
        },
        {
          label: "Presenter preparation and batch recording",
          category: "video_series",
          unit: "flat",
          quantity: 52,
          unitPrice: 6.96,
          partnerUnitPrice: 8,
        },
        {
          label: "Template editing and captions",
          category: "video_series",
          unit: "flat",
          quantity: 52,
          unitPrice: 17.4,
          partnerUnitPrice: 20,
        },
        {
          label: "Review, upload preparation, and management",
          category: "video_series",
          unit: "flat",
          quantity: 52,
          unitPrice: 7.83,
          partnerUnitPrice: 9,
        },
      ],
    });

    expect(blueprint.status).toBe("proposal");
    expect(blueprintUnitNames(blueprint)).toHaveLength(52);
    expect(blueprintUnitNames(blueprint).at(-1)).toBe("Video 52");
    expect(blueprintBudgetTotals(blueprint.budgetLines)).toEqual({
      internalCents: 226_200,
      partnerCents: 260_000,
    });
  });

  it("totals the 52-article translation budget with word-driven lines", () => {
    const blueprint = projectBlueprintSchema.parse({
      title: "Desiring God — 52 New Article Translations",
      kind: "article",
      unitCount: 52,
      unitName: "Article",
      workflow: "article_translation",
      wordCount: 78_000,
      partnerName: "Desiring God",
      budgetLines: [
        {
          label: "Translation",
          category: "translation",
          unit: "words",
          quantity: 78_000,
          unitPrice: 0.03,
          partnerUnitPrice: 0.036,
        },
        {
          label: "Editorial review",
          category: "editing",
          unit: "words",
          quantity: 78_000,
          unitPrice: 0.03,
          partnerUnitPrice: 0.0347,
        },
        {
          label: "Proofreading and quality assurance",
          category: "proofreading",
          unit: "words",
          quantity: 78_000,
          unitPrice: 0.01,
          partnerUnitPrice: 0.012,
        },
        {
          label: "Project coordination and delivery",
          category: "project_management",
          unit: "project",
          quantity: 1,
          unitPrice: 200,
          partnerUnitPrice: 312,
        },
      ],
    });

    expect(blueprintBudgetTotals(blueprint.budgetLines)).toEqual({
      internalCents: 566_000,
      partnerCents: 676_260,
    });
  });

  it("rejects a partial unit-title list", () => {
    expect(() =>
      projectBlueprintSchema.parse({
        title: "Article batch",
        kind: "article",
        unitCount: 2,
        unitTitles: ["Only one"],
        budgetLines: [
          {
            label: "Translation",
            category: "translation",
            unit: "words",
            quantity: 1_000,
            unitPrice: 0.03,
          },
        ],
      })
    ).toThrow(/exactly unitCount/i);
  });
});
