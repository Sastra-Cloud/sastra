import { array, dateOnly, identifier, IntegrationError, object, string } from "./contract";

export type PlanningSchedule = {
  revision: string; timezone: string; startDate: string | null; dueDate: string | null;
  tasks: { id: string; title: string; documentName: string; dueDate: string | null }[];
};
export type ScheduleEdit = Pick<PlanningSchedule, "revision" | "startDate" | "dueDate"> & {
  tasks: { id: string; dueDate: string | null }[];
};

export function parseScheduleEdit(value: unknown): ScheduleEdit {
  const input = object(value), revision = string(input.revision, 64);
  if (!/^[a-f0-9]{64}$/.test(revision)) throw new IntegrationError("invalid_payload", "Refresh the project schedule and try again.");
  const startDate = dateOnly(input.startDate), dueDate = dateOnly(input.dueDate);
  if (startDate && dueDate && startDate > dueDate) throw new IntegrationError("invalid_schedule", "Choose a deadline on or after the project start date.");
  const tasks = array(input.tasks).map(value => { const task = object(value); return { id: identifier(task.id), dueDate: dateOnly(task.dueDate) }; });
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new IntegrationError("invalid_payload", "Each task needs one deadline.");
  return { revision, startDate, dueDate, tasks };
}

/** Compare the live dates and mapping, not a delayed sync version. Never silently rebase a stale form. */
export function validateScheduleEdit(current: PlanningSchedule, edit: ScheduleEdit) {
  const ids = new Set(current.tasks.map(t => t.id));
  if (current.revision !== edit.revision || edit.tasks.length !== ids.size || edit.tasks.some(t => !ids.has(t.id))) {
    throw new IntegrationError("schedule_changed", "The schedule changed. Reload it and review your dates before saving.", 409);
  }
}
