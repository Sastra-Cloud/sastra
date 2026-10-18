export const QUEUE_CHANGED_MESSAGE = "This queue changed while you were editing. The latest order has been loaded; please try again.";

/** A reorder must describe the whole assignee queue, including hidden work. */
export function assertCompleteTaskQueue(currentIds: string[], orderedIds: string[]) {
  const expected = new Set(currentIds);
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new Error("A task can appear only once in a queue.");
  }
  if (expected.size !== orderedIds.length || orderedIds.some(id => !expected.has(id))) {
    throw new Error(QUEUE_CHANGED_MESSAGE);
  }
}

export function assertQueueRevision(actual: number, expected?: number) {
  if (expected !== undefined && actual !== expected) throw new Error(QUEUE_CHANGED_MESSAGE);
}
