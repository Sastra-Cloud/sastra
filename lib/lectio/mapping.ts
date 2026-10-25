import { IntegrationError, type StageMapping } from "./protocol/contract";

export function mappedPhases(mapping: StageMapping[], stepKeys: string[]) {
  if (new Set(mapping.map(m => m.stepKey)).size !== mapping.length || mapping.length !== stepKeys.length ||
    stepKeys.some(key => !mapping.some(m => m.stepKey === key))) {
    throw new IntegrationError("mapping_review_required", "Review the phase mapping for the current Lectio workflow.", 409);
  }
  const groups = new Map<string, string[]>();
  for (const m of mapping) if (m.phaseId) groups.set(m.phaseId, [...(groups.get(m.phaseId) ?? []), m.stepKey]);
  if (!groups.size) throw new IntegrationError("mapping_required", "Map at least one Lectio step to a Sastra phase.", 409);
  return groups;
}
