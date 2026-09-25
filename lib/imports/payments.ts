import type { ImportExtraction } from "./types";

/**
 * Whether the agreement actually commits funding, so the importer may pre-fill
 * each budget line's "Raised" (amountSecured). True only for a SIGNED MoU/grant:
 * an unsigned grant *application* / proposal leaves Raised at 0 because the money
 * has not been awarded yet (e.g. "we have yet to raise money"). A license-only
 * agreement states no incoming funding, so it is never treated as secured.
 */
export function fundsSecured(data: ImportExtraction): boolean {
  const signed = /^\d{4}-\d{2}-\d{2}$/.test(data.signedDate ?? "");
  return signed && data.agreementType !== "license_only";
}

/** Resolve where one agreement-level payment schedule is administered. */
export function resolvePaymentProjectIndex(
  data: ImportExtraction,
  selectedProjectIndices: number[]
): number | null {
  if (data.mouPaymentSchedule.length === 0) return null;
  const selected = [...new Set(selectedProjectIndices)];
  if (selected.length === 1) return selected[0];
  return data.paymentProjectIndex != null &&
    selected.includes(data.paymentProjectIndex)
    ? data.paymentProjectIndex
    : null;
}

/** A first-class group exists only for a genuine multi-project completion gate. */
export function shouldCreateSharedMouGroup(
  data: ImportExtraction,
  selectedProjectIndices: number[]
): boolean {
  return (
    new Set(selectedProjectIndices).size > 1 &&
    data.mouPaymentSchedule.some(
      (payment) => payment.trigger === "on_completion"
    )
  );
}

export function sharedMouAllocationsReconcile(
  data: ImportExtraction,
  selectedProjectIndices: number[]
): boolean {
  if (!shouldCreateSharedMouGroup(data, selectedProjectIndices)) return true;
  if (data.agreementTotalAmount == null || data.agreementTotalAmount <= 0) {
    return false;
  }
  const allocated = [...new Set(selectedProjectIndices)].reduce(
    (sum, index) => sum + (data.projects[index]?.totalAmount ?? 0),
    0
  );
  const scheduled = data.mouPaymentSchedule.reduce(
    (sum, payment) => sum + Math.round((payment.amount ?? 0) * 100), 0
  );
  return Math.abs(allocated - data.agreementTotalAmount) <= 0.005 &&
    scheduled === Math.round(data.agreementTotalAmount * 100);
}
