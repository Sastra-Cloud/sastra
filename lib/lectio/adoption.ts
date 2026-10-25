import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { lectioTaskLinks, lectioUnitLinks, tasks, units } from "@/lib/db/schema";
import type { IntegrationTransaction } from "./endpoint";
import { IntegrationError, array, identifier, object, type ProjectSnapshot, type StageMapping } from "./protocol/contract";
import { mappedPhases } from "./mapping";

/** Explicitly selected existing units only; ambiguity is a review error, never a name match. */
export async function adoptExistingUnits(tx: IntegrationTransaction, link: { id: string; projectId: string; handoffPhaseId: string | null }, snapshot: ProjectSnapshot, mapping: StageMapping[], input: unknown) {
  const choices = array(input, 1000).map(value => { const c = object(value); return { documentId: identifier(c.documentId), unitId: identifier(c.unitId) }; });
  if (new Set(choices.map(c => c.documentId)).size !== choices.length || new Set(choices.map(c => c.unitId)).size !== choices.length) throw new IntegrationError("ambiguous_units", "Choose each document and existing unit only once.");
  const groups = mappedPhases(mapping, snapshot.steps.map(s => s.key));
  for (const choice of choices) {
    if (!snapshot.documents.some(d => d.id === choice.documentId)) throw new IntegrationError("document_changed", "The source document changed. Review the link again.");
    const [unit] = await tx.select().from(units).where(and(eq(units.id, choice.unitId), eq(units.projectId, link.projectId))).for("update");
    if (!unit) throw new IntegrationError("unit_unavailable", "Choose an existing unit from this project.");
    const [bound] = await tx.select().from(lectioUnitLinks).where(eq(lectioUnitLinks.unitId, unit.id));
    if (bound) {
      if (bound.linkId === link.id && bound.documentId === choice.documentId) continue;
      throw new IntegrationError("unit_linked", "This unit already belongs to another translation document.");
    }
    const candidates = await tx.select().from(tasks).where(and(eq(tasks.projectId, link.projectId), eq(tasks.unitId, unit.id), inArray(tasks.phaseId, [...groups.keys(), ...(link.handoffPhaseId ? [link.handoffPhaseId] : [])])));
    for (const phaseId of [...groups.keys(), ...(link.handoffPhaseId ? [link.handoffPhaseId] : [])]) {
      if (candidates.filter(t => t.phaseId === phaseId).length > 1) throw new IntegrationError("ambiguous_tasks", "This unit has several tasks in a mapped phase. Resolve that ambiguity before adopting the unit.");
    }
    if (candidates.some(t => t.lectioManaged || t.printPaymentId)) throw new IntegrationError("managed_task", "An existing task is managed by another workflow. Choose another unit.");
    await tx.insert(lectioUnitLinks).values({ linkId: link.id, documentId: choice.documentId, unitId: unit.id, handoffTaskId: candidates.find(t => t.phaseId === link.handoffPhaseId)?.id });
    for (const task of candidates) if (task.phaseId && groups.has(task.phaseId)) await tx.insert(lectioTaskLinks).values({ taskId: task.id, linkId: link.id, documentId: choice.documentId, stepKeys: groups.get(task.phaseId)!, observedState: task.status });
  }
}
