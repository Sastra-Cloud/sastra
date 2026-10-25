/** Public Sastra/Lectio protocol v1. No database, framework, or provider imports. */
export const PROTOCOL_VERSION = "1";
export const SNAPSHOT_LIMIT = 2 * 1024 * 1024;
export const EVENT_LIMIT = 64 * 1024;

export class IntegrationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = "IntegrationError";
  }
}

export type StepState = "pending" | "active" | "completed";
export type SourceStep = {
  key: string; type: string; name: string; order: number; templateKey: string | null;
};
export type DocumentStep = {
  key: string; state: StepState; activatedAt: string | null; completedAt: string | null;
  assigneeIds: string[];
};
export type SourceDocument = {
  id: string; name: string; order: number; fileType: string;
  sourceWordCount: number; progress: number | null; steps: DocumentStep[];
};
export type ProjectSnapshot = {
  protocol: 1; connectionId: string; epoch: string; generation: number; version: number;
  project: { id: string; name: string; sourceLanguage: string; targetLanguage: string; status: string };
  steps: SourceStep[]; documents: SourceDocument[]; people: { id: string; name: string }[];
  allRequiredWorkComplete: boolean;
};
export type StageMapping = { stepKey: string; phaseId: string | null };
export type PlanningProjection = {
  version: number; timezone: string; startDate?: string | null; dueDate: string | null;
  documents: { documentId: string; dueDate: string | null; steps: { key: string; dueDate: string | null }[] }[];
};

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IntegrationError("invalid_payload", "Expected an object.");
  }
  return value as Record<string, unknown>;
}
export function string(value: unknown, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) {
    throw new IntegrationError("invalid_payload", "Invalid text field.");
  }
  return value;
}
export function identifier(value: unknown): string {
  const id = string(value, 160);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new IntegrationError("invalid_payload", "Invalid identifier.");
  return id;
}
export function integer(value: unknown, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new IntegrationError("invalid_payload", "Invalid number.");
  }
  return value;
}
export function array(value: unknown, max = 2000): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new IntegrationError("invalid_payload", "Invalid list.");
  return value;
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  const text = string(value, 40);
  if (!/^\d{4}-\d\d-\d\dT.*Z$/.test(text) || !Number.isFinite(Date.parse(text))) {
    throw new IntegrationError("invalid_payload", "Invalid source timestamp.");
  }
  return text;
}
export function dateOnly(value: unknown): string | null {
  if (value === null) return null;
  const text = string(value, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) {
    throw new IntegrationError("invalid_payload", "Invalid calendar date.");
  }
  return text;
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) throw new IntegrationError("invalid_payload", "Duplicate source identity.");
}

export function parseSnapshot(value: unknown): ProjectSnapshot {
  const s = object(value), p = object(s.project);
  if (s.protocol !== 1 || typeof s.allRequiredWorkComplete !== "boolean") {
    throw new IntegrationError("unsupported_protocol", "Unsupported snapshot.", 409);
  }
  const steps = array(s.steps, 100).map((value): SourceStep => {
    const x = object(value);
    return { key: identifier(x.key), type: string(x.type, 100), name: string(x.name),
      order: integer(x.order), templateKey: x.templateKey === null ? null : identifier(x.templateKey) };
  });
  unique(steps.map(s => s.key));
  const people = array(s.people).map(value => {
    const x = object(value); return { id: identifier(x.id), name: string(x.name) };
  });
  unique(people.map(p => p.id));
  const documents = array(s.documents).map((value): SourceDocument => {
    const x = object(value);
    const progress = x.progress;
    if (progress !== null && (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 1)) {
      throw new IntegrationError("invalid_payload", "Invalid source progress.");
    }
    const states = array(x.steps, 100).map((value): DocumentStep => {
      const state = object(value), key = identifier(state.key);
      if (!steps.some(s => s.key === key) || !["pending", "active", "completed"].includes(String(state.state))) {
        throw new IntegrationError("invalid_payload", "Unknown workflow state.");
      }
      const completedAt = timestamp(state.completedAt);
      if (state.state === "completed" && !completedAt) throw new IntegrationError("invalid_payload", "Missing completion time.");
      const assigneeIds = array(state.assigneeIds, 100).map(identifier);
      unique(assigneeIds);
      if (assigneeIds.some(id => !people.some(p => p.id === id))) throw new IntegrationError("invalid_payload", "Unknown source person.");
      return { key, state: state.state as StepState, activatedAt: timestamp(state.activatedAt), completedAt, assigneeIds };
    });
    unique(states.map(s => s.key));
    if (states.length !== steps.length) throw new IntegrationError("incomplete_snapshot", "The workflow snapshot is incomplete.", 409);
    return { id: identifier(x.id), name: string(x.name), order: integer(x.order), fileType: string(x.fileType, 30),
      sourceWordCount: integer(x.sourceWordCount), progress, steps: states };
  });
  unique(documents.map(d => d.id));
  const complete = documents.length > 0 && steps.length > 0 && documents.every(d => d.steps.every(s => s.state === "completed"));
  if (s.allRequiredWorkComplete && !complete) throw new IntegrationError("invalid_payload", "Completion disagrees with source work.");
  return { protocol: 1, connectionId: identifier(s.connectionId), epoch: identifier(s.epoch),
    generation: integer(s.generation, 1), version: integer(s.version, 1),
    project: { id: identifier(p.id), name: string(p.name), sourceLanguage: string(p.sourceLanguage, 100),
      targetLanguage: string(p.targetLanguage, 100), status: string(p.status, 50) },
    steps, documents, people, allRequiredWorkComplete: s.allRequiredWorkComplete };
}

export function projectTaskState(steps: DocumentStep[]): "todo" | "in_progress" | "done" {
  if (!steps.length) throw new IntegrationError("empty_mapping", "Choose a workflow step before linking this task.");
  if (steps.every(s => s.state === "completed")) return "done";
  return steps.every(s => s.state === "pending") ? "todo" : "in_progress";
}

export function parsePlanning(value: unknown): PlanningProjection {
  const p = object(value), timezone = string(p.timezone, 100);
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
  catch { throw new IntegrationError("invalid_payload", "Invalid workspace timezone."); }
  const documents = array(p.documents).map(value => {
    const x = object(value);
    const steps = array(x.steps, 100).map(value => { const s = object(value); return { key: identifier(s.key), dueDate: dateOnly(s.dueDate) }; });
    unique(steps.map(s => s.key));
    return { documentId: identifier(x.documentId), dueDate: dateOnly(x.dueDate), steps };
  });
  unique(documents.map(d => d.documentId));
  return { version: integer(p.version, 1), timezone, startDate: p.startDate === undefined ? null : dateOnly(p.startDate), dueDate: dateOnly(p.dueDate), documents };
}
