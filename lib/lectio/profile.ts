import "server-only";
import { eq } from "drizzle-orm";
import { phaseTemplates, phases, planTemplates } from "@/lib/db/schema";
import type { IntegrationTransaction } from "./endpoint";
import { IntegrationError, type ProjectSnapshot } from "./protocol/contract";
import { type SetupProfile } from "./protocol/profile";
import { mappedPhases } from "./mapping";

export async function validateProfile(tx: IntegrationTransaction, profile: SetupProfile, stepKeys: string[]) {
  const groups = mappedPhases(profile.stageMap, stepKeys);
  const [template] = await tx.select().from(planTemplates).where(eq(planTemplates.id, profile.planTemplateId));
  if (!template?.isActive) throw new IntegrationError("template_unavailable", "Choose an active Sastra project template.", 409);
  const stages = await tx.select().from(phaseTemplates).where(eq(phaseTemplates.planTemplateId, template.id));
  if ([...groups.keys()].some(id => !stages.some(s => s.id === id))) throw new IntegrationError("invalid_profile", "Choose phases from the selected project template.");
  if (profile.handoffPhaseTemplateId) {
    const handoff = stages.find(s => s.id === profile.handoffPhaseTemplateId);
    if (!handoff || handoff.orderIndex <= Math.max(...stages.filter(s => groups.has(s.id)).map(s => s.orderIndex))) throw new IntegrationError("invalid_handoff", "Choose a next stage after the mapped translation phases.");
  }
  return stages;
}

export async function resolveProfile(tx: IntegrationTransaction, profile: SetupProfile, projectId: string, snapshot: ProjectSnapshot) {
  await validateProfile(tx, profile, snapshot.steps.map(s => s.templateKey || ""));
  const local = await tx.select().from(phases).where(eq(phases.projectId, projectId));
  function phase(id: string | null) {
    if (!id) return null;
    const matches = local.filter(p => p.sourcePhaseTemplateId === id);
    if (matches.length !== 1) throw new IntegrationError("mapping_review_required", "This project's phases differ from the connected defaults. Review its workflow mapping.", 409);
    return matches[0].id;
  }
  return { stageMap: snapshot.steps.map(s => ({ stepKey: s.key, phaseId: phase(profile.stageMap.find(m => m.stepKey === s.templateKey)!.phaseId) })),
    handoffPhaseId: phase(profile.handoffPhaseTemplateId), deliverFiles: profile.deliverFiles };
}
