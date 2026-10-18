import { describe, expect, it } from "vitest";
import { assertCompleteTaskQueue, assertQueueRevision, QUEUE_CHANGED_MESSAGE } from "./queue";

describe("shared task queue contracts", () => {
  it("accepts a complete rearrangement and an empty queue", () => {
    expect(() => assertCompleteTaskQueue(["a", "b", "c"], ["c", "a", "b"])).not.toThrow();
    expect(() => assertCompleteTaskQueue([], [])).not.toThrow();
  });
  it("rejects duplicate tasks, including a same-length duplicate submission", () => {
    expect(() => assertCompleteTaskQueue(["a", "b"], ["a", "a"])).toThrow("only once");
  });
  it.each([
    [["a", "b"], ["a"]],
    [["a", "b"], ["a", "c"]],
    [["a"], ["a", "b"]],
  ])("rejects hidden, foreign, newly assigned, or completed task mismatches", (current, submitted) => {
    expect(() => assertCompleteTaskQueue(current, submitted)).toThrow(QUEUE_CHANGED_MESSAGE);
  });
  it("rejects a stale manager revision before any ordering can be saved", () => {
    expect(() => assertQueueRevision(3, 2)).toThrow(QUEUE_CHANGED_MESSAGE);
    expect(() => assertQueueRevision(3, 3)).not.toThrow();
    expect(() => assertQueueRevision(3)).not.toThrow();
  });
});
