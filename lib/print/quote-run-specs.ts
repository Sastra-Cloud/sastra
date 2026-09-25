import { mmToIn } from "@/lib/print/estimate";

export type QuoteProductionSpecs = {
  trimWidthMm: string | number | null;
  trimHeightMm: string | number | null;
  textPages: number | null;
  coverPages: number | null;
  textSpec: string | null;
  coverSpec: string | null;
  binding: string | null;
  deliveryLocation: string | null;
};

export type PrintRunSpecPatch = {
  trimWidthIn?: string;
  trimHeightIn?: string;
  quotedTextPages?: number;
  coverPages?: number;
  textPaper?: string;
  coverPaper?: string;
  binding?: string;
  deliveryLocation?: string;
};

function inchesFromMm(value: string | number | null): string | null {
  const mm = Number(value);
  if (!Number.isFinite(mm) || mm <= 0) return null;
  return mmToIn(mm).toFixed(2);
}

function clean(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

/**
 * Convert reviewed quote production specs into the print-run storage shape.
 * Quote dimensions are canonical millimetres; runs/settings store canonical
 * inches and convert to the project's selected unit at the UI and RFQ boundary.
 */
export function quoteRunSpecPatch(
  quote: QuoteProductionSpecs
): PrintRunSpecPatch {
  const patch: PrintRunSpecPatch = {};
  const trimWidthIn = inchesFromMm(quote.trimWidthMm);
  const trimHeightIn = inchesFromMm(quote.trimHeightMm);
  const textPaper = clean(quote.textSpec);
  const coverPaper = clean(quote.coverSpec);
  const binding = clean(quote.binding);
  const deliveryLocation = clean(quote.deliveryLocation);

  if (trimWidthIn) patch.trimWidthIn = trimWidthIn;
  if (trimHeightIn) patch.trimHeightIn = trimHeightIn;
  if (quote.textPages != null) patch.quotedTextPages = quote.textPages;
  if (quote.coverPages != null) patch.coverPages = quote.coverPages;
  if (textPaper) patch.textPaper = textPaper;
  if (coverPaper) patch.coverPaper = coverPaper;
  if (binding) patch.binding = binding;
  if (deliveryLocation) patch.deliveryLocation = deliveryLocation;
  return patch;
}

export function quoteHasProductionSpecs(quote: QuoteProductionSpecs): boolean {
  return Object.keys(quoteRunSpecPatch(quote)).length > 0;
}
