import { IntegrationError, identifier, integer, object, type StageMapping } from "./contract";

export type SetupProfile = {
  version: number; planTemplateId: string; teamWorkflowId: string; kind: "book" | "article";
  stageMap: StageMapping[]; handoffPhaseTemplateId: string | null; deliverFiles: boolean;
};
export function parseProfile(input: unknown): SetupProfile {
  const p = object(input);
  if (!Array.isArray(p.stageMap) || !p.stageMap.length || p.stageMap.length > 100 ||
    !["book", "article"].includes(String(p.kind)) || typeof p.deliverFiles !== "boolean") {
    throw new IntegrationError("profile_required", "Ask an administrator to review the connected project defaults.", 409);
  }
  return { version: integer(p.version, 1), planTemplateId: identifier(p.planTemplateId), teamWorkflowId: identifier(p.teamWorkflowId),
    kind: p.kind as "book" | "article", deliverFiles: p.deliverFiles,
    handoffPhaseTemplateId: p.handoffPhaseTemplateId === null ? null : identifier(p.handoffPhaseTemplateId),
    stageMap: p.stageMap.map(value => { const m = object(value); return { stepKey: identifier(m.stepKey), phaseId: m.phaseId === null ? null : identifier(m.phaseId) }; }) };
}
