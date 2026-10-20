export type PartnerQuoteLine = {
  id: string;
  label: string;
  partnerLabel: string | null;
  partnerUnitPrice: string | null;
  partnerVisible: boolean;
  unit: "words" | "pages" | "cover" | "project" | "flat";
  quantity: string;
  unitPrice: string;
  amount: string;
};

export type PartnerLinePatch = {
  id: string;
  patch: Partial<Pick<PartnerQuoteLine, "partnerLabel" | "partnerUnitPrice" | "partnerVisible">>;
};

/** Patch only the affected public fields, preserving other lines and edits. */
export function applyPartnerLinePatch<T extends PartnerQuoteLine>(items: T[], mutation: PartnerLinePatch): T[] {
  return items.map((item) => item.id === mutation.id ? { ...item, ...mutation.patch } : item);
}

export type PartnerRateChange = {
  id: string;
  previousPartnerUnitPrice: string | null;
  appliedPartnerUnitPrice: string;
};

export type PartnerRateResult =
  | { rates: Record<string, string | null>; changes: PartnerRateChange[] }
  | { error: string };

/** Change public rates only; null restores inheritance from the internal rate. */
export function applyPartnerRates<T extends PartnerQuoteLine>(items: T[], rates: Record<string, string | null>): T[] {
  return items.map((item) => Object.hasOwn(rates, item.id) ? { ...item, partnerUnitPrice: rates[item.id] } : item);
}
