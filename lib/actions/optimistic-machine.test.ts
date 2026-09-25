import { describe, expect, it } from "vitest";

import {
  optimisticVisibleState,
  settleOptimisticEntry,
  type OptimisticEntry,
  type OptimisticMachine,
} from "./optimistic-machine";

type Mutation = { id: string; value: string };
type State = Record<string, string>;

const update = (current: State, mutation: Mutation): State => ({
  ...current,
  [mutation.id]: mutation.value,
});

function entry(
  id: number,
  input: Mutation,
  status: OptimisticEntry<State, Mutation>["status"] = "pending"
): OptimisticEntry<State, Mutation> {
  return { id, input, key: input.id, status };
}

function machine(
  entries: OptimisticEntry<State, Mutation>[]
): OptimisticMachine<State, Mutation> {
  return { source: { task: "old" }, confirmed: { task: "old" }, entries };
}

describe("optimistic mutation machine", () => {
  it("shows an enqueued change immediately", () => {
    const state = machine([entry(1, { id: "task", value: "new" })]);
    expect(optimisticVisibleState(state, update)).toEqual({ task: "new" });
  });

  it("keeps a successful change visible after it settles", () => {
    const state = settleOptimisticEntry(
      machine([entry(1, { id: "task", value: "new" })]),
      1,
      "succeeded",
      undefined,
      update
    );
    expect(state.entries).toEqual([]);
    expect(optimisticVisibleState(state, update)).toEqual({ task: "new" });
  });

  it("rolls back a failed change exactly", () => {
    const state = settleOptimisticEntry(
      machine([entry(1, { id: "task", value: "new" })]),
      1,
      "failed",
      undefined,
      update
    );
    expect(optimisticVisibleState(state, update)).toEqual({ task: "old" });
  });

  it("reconciles an optimistic creation with its canonical ID", () => {
    type Item = { id: string; title: string };
    const optimistic = { id: "temporary-task", title: "New task" };
    const update = (current: Item[], item: Item) => [...current, item];
    const state: OptimisticMachine<Item[], Item> = {
      source: [],
      confirmed: [],
      entries: [
        {
          id: 1,
          input: optimistic,
          key: optimistic.id,
          status: "pending",
          reconcile: (result, current) =>
            current.map((item) =>
              item.id === optimistic.id
                ? { ...item, id: (result as { id: string }).id }
                : item
            ),
        },
      ],
    };

    expect(optimisticVisibleState(state, update)).toEqual([optimistic]);
    const settled = settleOptimisticEntry(
      state,
      1,
      "succeeded",
      { id: "saved-task" },
      update
    );
    expect(optimisticVisibleState(settled, update)).toEqual([
      { id: "saved-task", title: "New task" },
    ]);
  });

  it("removes an optimistic creation when saving fails", () => {
    type Item = { id: string };
    const optimistic = { id: "temporary-task" };
    const update = (current: Item[], item: Item) => [...current, item];
    const state: OptimisticMachine<Item[], Item> = {
      source: [],
      confirmed: [],
      entries: [
        { id: 1, input: optimistic, key: optimistic.id, status: "pending" },
      ],
    };

    const failed = settleOptimisticEntry(
      state,
      1,
      "failed",
      undefined,
      update
    );
    expect(optimisticVisibleState(failed, update)).toEqual([]);
  });

  it("settles rapid edits in invocation order when responses arrive out of order", () => {
    const queued = machine([
      entry(1, { id: "task", value: "first" }),
      entry(2, { id: "task", value: "second" }),
    ]);
    const secondSucceeded = settleOptimisticEntry(
      queued,
      2,
      "succeeded",
      undefined,
      update
    );
    expect(optimisticVisibleState(secondSucceeded, update)).toEqual({
      task: "second",
    });

    const firstFailed = settleOptimisticEntry(
      secondSucceeded,
      1,
      "failed",
      undefined,
      update
    );
    expect(firstFailed.entries).toEqual([]);
    expect(optimisticVisibleState(firstFailed, update)).toEqual({
      task: "second",
    });
  });
});
