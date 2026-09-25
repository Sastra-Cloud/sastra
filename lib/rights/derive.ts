/** Pure rights-status math (no DB, no "use server") — shared by the rights
 * actions and the document-import commit. */

export type RightsStep = "not_needed" | "not_started" | "in_progress" | "signed";

/** Overall rights status derived from the agreement type + step statuses. */
export function deriveOverall(
  agreementType: string,
  mouStatus: RightsStep,
  licenseStatus: RightsStep
): "none" | "in_progress" | "complete" {
  const steps: RightsStep[] = [];
  if (agreementType !== "license_only") steps.push(mouStatus);
  if (agreementType !== "mou_only") steps.push(licenseStatus);
  const relevant = steps.filter((s) => s !== "not_needed");
  if (relevant.length === 0) return "none";
  if (relevant.every((s) => s === "signed")) return "complete";
  if (relevant.some((s) => s === "in_progress" || s === "signed"))
    return "in_progress";
  return "none";
}
