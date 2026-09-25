export type OptimisticEntry<State, Input> = {
  id: number;
  input: Input;
  key: string | null;
  status: "pending" | "succeeded" | "failed";
  result?: unknown;
  reconcile?: (result: unknown, optimisticState: State) => State;
};

export type OptimisticMachine<State, Input> = {
  source: State;
  confirmed: State;
  entries: OptimisticEntry<State, Input>[];
};

export function optimisticVisibleState<State, Input>(
  machine: OptimisticMachine<State, Input>,
  update: (current: State, input: Input) => State
) {
  return machine.entries.reduce(
    (current, entry) =>
      entry.status === "failed" ? current : update(current, entry.input),
    machine.confirmed
  );
}

export function settleOptimisticEntry<State, Input>(
  machine: OptimisticMachine<State, Input>,
  entryId: number,
  status: "succeeded" | "failed",
  result: unknown,
  update: (current: State, input: Input) => State
): OptimisticMachine<State, Input> {
  const entries = machine.entries.map((entry) =>
    entry.id === entryId ? { ...entry, status, result } : entry
  );
  let confirmed = machine.confirmed;
  let settledCount = 0;

  for (const entry of entries) {
    if (entry.status === "pending") break;
    settledCount += 1;
    if (entry.status === "failed") continue;
    const next = update(confirmed, entry.input);
    confirmed = entry.reconcile
      ? entry.reconcile(entry.result, next)
      : next;
  }

  return {
    ...machine,
    confirmed,
    entries: entries.slice(settledCount),
  };
}
