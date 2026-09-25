export const DEFAULT_PRINT_TRIM_WIDTH_IN = 6;
export const DEFAULT_PRINT_TRIM_HEIGHT_IN = 9;
export const DEFAULT_LANGUAGE_EXPANSION_FACTOR = 1.5;
export const DEFAULT_PRINT_CC_EMAILS: readonly string[] = [];
export const DEFAULT_FINANCIAL_EMAIL = "";

export type MeasurementUnit = "in" | "mm";

export function measurementUnit(value: string | null | undefined): MeasurementUnit {
  return value === "mm" ? "mm" : "in";
}

export function measurementFromInches(
  value: number | string | null | undefined,
  unit: MeasurementUnit
): number {
  const inches = Number(value);
  if (!Number.isFinite(inches)) return 0;
  return unit === "mm" ? inToMm(inches) : inches;
}

export function measurementToInches(
  value: number | string | null | undefined,
  unit: MeasurementUnit
): number {
  const measurement = Number(value);
  if (!Number.isFinite(measurement)) return 0;
  return unit === "mm" ? mmToIn(measurement) : measurement;
}

export function measurementInputFromInches(
  value: number | string | null | undefined,
  unit: MeasurementUnit
): string {
  const measurement = measurementFromInches(value, unit);
  return measurement.toFixed(2).replace(/\.?0+$/, "");
}

export function measurementInputFromMm(
  value: number | string | null | undefined,
  unit: MeasurementUnit
): string {
  if (value == null || value === "") return "";
  const millimetres = Number(value);
  if (!Number.isFinite(millimetres)) return "";
  const measurement = unit === "mm" ? millimetres : mmToIn(millimetres);
  return measurement.toFixed(2).replace(/\.?0+$/, "");
}

export function measurementInputToMm(
  value: number | string | null | undefined,
  unit: MeasurementUnit
): number {
  const measurement = Number(value);
  if (!Number.isFinite(measurement)) return 0;
  return unit === "mm" ? measurement : inToMm(measurement);
}

export function formatTrimSize(
  widthIn: number | string | null | undefined,
  heightIn: number | string | null | undefined,
  unit: MeasurementUnit
): string {
  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  });
  return `${formatter.format(measurementFromInches(widthIn, unit))} × ${formatter.format(
    measurementFromInches(heightIn, unit)
  )} ${unit}`;
}

export type PrintEstimateInput = {
  wordCount: number;
  wordsPerPage: number;
  sourcePageCount?: number | string | null;
  trimWidthIn?: number | string | null;
  trimHeightIn?: number | string | null;
  languageExpansionFactor?: number | string | null;
};

function num(value: number | string | null | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function estimatePrintPages(input: PrintEstimateInput): number {
  const expansion = num(
    input.languageExpansionFactor,
    DEFAULT_LANGUAGE_EXPANSION_FACTOR
  );

  // The target-language edition prints at the SAME trim as the source page-count
  // reference, so trim size is not a page-count factor: target pages = source
  // pages × the language expansion factor. Kept in lock-step with the budget's
  // `lineQuantity("pages", …)` (Typesetting) in lib/budget/compute.ts, which
  // uses the identical formula — the two must not diverge. Trim width/height
  // stay on the run/settings only as real print specs for RFQs.
  const sourcePages = num(input.sourcePageCount, 0);
  if (sourcePages > 0) {
    return Math.max(0, Math.ceil(sourcePages * expansion));
  }

  const wordCount = Math.max(0, Math.round(num(input.wordCount, 0)));
  const wordsPerPage = num(input.wordsPerPage, 0);
  if (!wordCount || !wordsPerPage) return 0;
  return Math.max(0, Math.ceil((wordCount * expansion) / wordsPerPage));
}

type EstimateQuote = {
  reviewStatus: string;
  kind?: string;
  quantityCps: number | null;
  totalAmount: string | number | null;
};

/**
 * The quote that drives the project's print-cost estimate: an accepted quote
 * wins; else the quote for the confirmed copy count; else the cheapest priced
 * quote; else none. Rejected quotes are ignored. Pure so it can be unit-tested.
 */
export function chooseEstimateQuote<T extends EstimateQuote>(
  quotes: T[],
  quantityTarget: number | null
): T | null {
  const active = quotes.filter((q) => q.reviewStatus !== "rejected");
  const priced = active.filter((q) => Number(q.totalAmount) > 0);
  const accepted = active
    .filter((q) => q.reviewStatus === "accepted")
    .toSorted((left, right) => {
      // A staged final invoice can state only the balance due. Prefer the
      // accepted order/quote/deposit document that carries the complete print
      // commitment, then the largest stated total as a safe legacy fallback.
      const leftIsFinal = left.kind === "final_invoice" ? 1 : 0;
      const rightIsFinal = right.kind === "final_invoice" ? 1 : 0;
      return (
        leftIsFinal - rightIsFinal ||
        Number(["invoice", "deposit_invoice"].includes(right.kind ?? "")) - Number(["invoice", "deposit_invoice"].includes(left.kind ?? "")) ||
        Number(right.totalAmount) - Number(left.totalAmount)
      );
    });
  return (
    accepted[0] ??
    (quantityTarget != null
      ? priced.find((q) => q.quantityCps === quantityTarget)
      : undefined) ??
    [...priced].sort(
      (a, b) => Number(a.totalAmount) - Number(b.totalAmount)
    )[0] ??
    null
  );
}

export function mmToIn(value: number): number {
  return value / 25.4;
}

export function inToMm(value: number): number {
  return value * 25.4;
}
