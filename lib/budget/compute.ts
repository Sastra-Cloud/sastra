/**
 * Pure budget math (no DB, no framework) — safe to unit-test and to reuse for
 * a client-side live preview. Mirrors the team's quotation spreadsheet:
 *   AMOUNT = QTY × UNIT PRICE, with word-count-driven auto-quantities.
 *
 * Money is computed in integer "micro-units" to avoid float drift: quantities
 * carry 2 decimals (numeric(14,2)), rates carry 4 decimals (numeric(10,4)).
 */

export type BudgetGroup = "book_publishing" | "additional_media";

export type BudgetUnit = "words" | "pages" | "cover" | "project" | "flat";

export type BudgetCategory =
  | "translation"
  | "proofreading"
  | "editing"
  | "cover_design"
  | "typesetting"
  | "project_management"
  | "print_ship"
  | "audiobook"
  | "video_series"
  | "custom";

/** User-facing budget group name, adapted to the project's actual format. */
export function budgetGroupLabel(
  group: BudgetGroup,
  projectKind: string | null | undefined
): string {
  if (group === "additional_media") {
    if (projectKind === "podcast") return "Podcast Production";
    if (projectKind === "video_series") return "Video Production";
    return "Additional Media";
  }
  if (projectKind === "article") return "Article Publishing";
  if (projectKind === "podcast") return "Podcast Production";
  if (projectKind === "video_series") return "Video Production";
  if (projectKind === "other") return "Project Costs";
  return "Book Publishing";
}

/** The per-category rate columns on `project_budget_settings` (numeric → string). */
export type BudgetRates = {
  rateTranslation: string;
  rateProofreading: string;
  rateEditing: string;
  rateCoverDesign: string;
  rateTypesetting: string;
  rateProjectManagement: string;
  ratePrintShip: string;
  rateAudiobook: string;
  rateVideoSeries: string;
};

export type QuantityBasis = {
  wordCount: number;
  wordsPerPage: number;
  sourcePageCount?: number | null;
  languageExpansionFactor?: number | string | null;
};

export const DEFAULT_LANGUAGE_EXPANSION_FACTOR = 1.5;

/** The 9 standard quotation lines, in display order (single source of truth). */
export const STANDARD_LINES: ReadonlyArray<{
  category: Exclude<BudgetCategory, "custom">;
  group: BudgetGroup;
  label: string;
  unit: BudgetUnit;
  rateKey: keyof BudgetRates;
}> = [
  { category: "translation", group: "book_publishing", label: "Translation", unit: "words", rateKey: "rateTranslation" },
  { category: "proofreading", group: "book_publishing", label: "Proofreading", unit: "words", rateKey: "rateProofreading" },
  { category: "editing", group: "book_publishing", label: "Editing", unit: "words", rateKey: "rateEditing" },
  { category: "cover_design", group: "book_publishing", label: "Cover Design / Adaptation", unit: "cover", rateKey: "rateCoverDesign" },
  { category: "typesetting", group: "book_publishing", label: "Typesetting", unit: "pages", rateKey: "rateTypesetting" },
  { category: "project_management", group: "book_publishing", label: "Project Management", unit: "project", rateKey: "rateProjectManagement" },
  // NOTE: Print / Ship is intentionally NOT seeded. The print cost is driven by
  // the printer quote for a chosen copy count and maintained as a project-level
  // print_ship line by `syncPrintEstimateToBudget` (lib/print/actions.ts).
  { category: "audiobook", group: "additional_media", label: "Audiobook Production", unit: "words", rateKey: "rateAudiobook" },
  { category: "video_series", group: "additional_media", label: "Video Series", unit: "words", rateKey: "rateVideoSeries" },
];

function toScaled(value: string | number | null | undefined, dp: number): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** dp);
}

/** Whole cents for an amount, computed without float drift. */
export function lineAmountCents(
  quantity: string | number | null | undefined,
  unitPrice: string | number | null | undefined
): number {
  const q = toScaled(quantity, 2); // hundredths
  const p = toScaled(unitPrice, 4); // ten-thousandths
  // q*p is scaled by 1e6; divide by 1e4 to land on cents (scaled 1e2).
  return Math.round((q * p) / 10000);
}

/** AMOUNT = QTY × UNIT PRICE, as a numeric(14,2)-ready string. */
export function lineAmount(
  quantity: string | number | null | undefined,
  unitPrice: string | number | null | undefined
): string {
  return (lineAmountCents(quantity, unitPrice) / 100).toFixed(2);
}

/**
 * Auto-quantity for a line, from its unit:
 *   words → word count · pages → round(words / wordsPerPage) · everything else → 1.
 */
export function lineQuantity(unit: BudgetUnit, basis: QuantityBasis): number {
  switch (unit) {
    case "words":
      return Math.max(0, Math.round(basis.wordCount));
    case "pages": {
      const factor = Number(basis.languageExpansionFactor);
      const expansion =
        Number.isFinite(factor) && factor > 0
          ? factor
          : DEFAULT_LANGUAGE_EXPANSION_FACTOR;
      const sourcePages = Math.max(0, Math.round(Number(basis.sourcePageCount ?? 0)));
      if (sourcePages > 0) return Math.ceil(sourcePages * expansion);
      return basis.wordsPerPage > 0
        ? Math.ceil((Math.max(0, basis.wordCount) * expansion) / basis.wordsPerPage)
        : 0;
    }
    case "cover":
    case "project":
    case "flat":
      return 1;
  }
}

/** The budget group a category belongs to (audiobook/video → additional_media). */
export function groupForCategory(category: BudgetCategory): BudgetGroup {
  return (
    STANDARD_LINES.find((l) => l.category === category)?.group ??
    "book_publishing"
  );
}

/** The configured rate (string) for a standard category. */
export function rateForCategory(
  category: Exclude<BudgetCategory, "custom">,
  rates: BudgetRates
): string {
  const line = STANDARD_LINES.find((l) => l.category === category);
  return line ? rates[line.rateKey] : "0";
}

/** Sum a set of stored line amounts (strings) into whole cents. */
export function sumAmountCents(
  items: ReadonlyArray<{ amount: string | number }>
): number {
  return items.reduce((acc, it) => acc + toScaled(it.amount, 2), 0);
}

/**
 * Total committed funding without counting an imported agreement twice when
 * it appears both on quote lines and in the payment schedule.
 */
export function committedFundingTotal(
  lineRaised: number,
  scheduledFunding: number,
  receivedContributions = 0
): number {
  return (
    Math.max(0, lineRaised, scheduledFunding) +
    Math.max(0, receivedContributions)
  );
}

export const DEFAULT_FUNDING_DEDUCTION_BPS = 1300;

/** Clamp a persisted deduction rate to a safe 0–99.99% range. */
export function normalizeDeductionBps(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9999, Math.max(0, Math.round(value ?? 0)));
}

/** Convert a user-facing percentage (13) into basis points (1300). */
export function deductionPercentToBps(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return normalizeDeductionBps((value ?? 0) * 100);
}

/**
 * Gross amount a partner must contribute so the expected net covers a cost.
 * Both arguments/results are integer cents; the result always rounds upward.
 */
export function grossTargetCents(
  internalCostCents: number,
  deductionBps: number
): number {
  const cost = Math.max(0, Math.round(internalCostCents));
  const retainedBps = 10_000 - normalizeDeductionBps(deductionBps);
  return retainedBps > 0 ? Math.ceil((cost * 10_000) / retainedBps) : 0;
}

/** Expected amount available after the configured deduction. */
export function expectedNetCents(
  grossCents: number,
  deductionBps: number
): number {
  const gross = Math.max(0, Math.round(grossCents));
  return Math.round(
    (gross * (10_000 - normalizeDeductionBps(deductionBps))) / 10_000
  );
}

/** Suggested public per-copy price, rounded upward to a whole cent. */
export function suggestedPerCopyPriceCents(
  internalCostCents: number,
  deductionBps: number,
  quantity: number
): number {
  const copies = Math.max(0, Math.floor(quantity));
  return copies > 0
    ? Math.ceil(grossTargetCents(internalCostCents, deductionBps) / copies)
    : 0;
}

type PublicRateLine = {
  id: string;
  unit: BudgetUnit;
  quantity: string | number;
  unitPrice: string | number;
  amount: string | number;
  partnerVisible?: boolean;
  partnerUnitPrice?: string | number | null;
};

/**
 * Suggest public rates that recover the configured deduction without exposing
 * it as a separate line. Selected lines absorb the remaining gross-up
 * proportionally; word rates round upward to 4 decimals and other rates to 2.
 */
export function suggestPartnerRates(
  items: ReadonlyArray<PublicRateLine>,
  selectedIds: ReadonlySet<string>,
  deductionBps: number
): Record<string, string> {
  const visible = items.filter((item) => item.partnerVisible !== false);
  // Hidden partner lines are still real internal costs. The selected public
  // rates must recover the entire scope, not just the costs the partner sees.
  const internalTotal = sumAmountCents(items);
  const targetCents = grossTargetCents(internalTotal, deductionBps);
  const selected = visible.filter(
    (item) =>
      selectedIds.has(item.id) &&
      Math.max(0, toScaled(item.amount, 2)) > 0
  );
  const selectedBaseCents = sumAmountCents(selected);
  if (selected.length === 0 || selectedBaseCents <= 0) {
    throw new Error("Select at least one partner-visible line with a cost.");
  }

  const selectedWithCost = new Set(selected.map((item) => item.id));
  const unselectedPublicCents = visible
    .filter((item) => !selectedWithCost.has(item.id))
    .reduce(
      (sum, item) =>
        sum +
        lineAmountCents(
          item.quantity,
          item.partnerUnitPrice ?? item.unitPrice
        ),
      0
    );
  const selectedTargetCents = Math.max(0, targetCents - unselectedPublicCents);

  return Object.fromEntries(
    selected.map((item) => {
      const itemCostCents = Math.max(0, toScaled(item.amount, 2));
      // Allocate the selected gross target from the stored internal amounts.
      // Do not scale the stored unit rate: a manager may have overridden an
      // amount independently, so quantity × unitPrice is not guaranteed to
      // equal the internal cost that the quotation must recover.
      const allocatedCents = Math.ceil(
        (selectedTargetCents * itemCostCents) / selectedBaseCents
      );
      const quantity = Math.max(0, Number(item.quantity) || 0);
      const decimals = item.unit === "words" ? 4 : 2;
      const scale = 10 ** decimals;
      if (quantity <= 0) {
        throw new Error("Selected partner-visible lines must have a quantity.");
      }

      let scaledRate = Math.ceil(
        ((allocatedCents / 100) * scale) / quantity
      );
      // Float conversion and cent rounding can otherwise leave an edge case a
      // cent short. Increase by the smallest displayed rate step until this
      // line covers its allocation.
      while (
        lineAmountCents(quantity, scaledRate / scale) < allocatedCents
      ) {
        scaledRate += 1;
      }
      return [item.id, (scaledRate / scale).toFixed(decimals)];
    })
  );
}

export function partnerQuoteTotalCents(
  items: ReadonlyArray<PublicRateLine>
): number {
  return items
    .filter((item) => item.partnerVisible !== false)
    .reduce(
      (sum, item) =>
        sum +
        lineAmountCents(
          item.quantity,
          item.partnerUnitPrice ?? item.unitPrice
        ),
      0
    );
}
