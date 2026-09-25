"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import {
  mutationErrorMessage,
  thrownMutationMessage,
} from "@/lib/actions/result";
import {
  optimisticVisibleState,
  settleOptimisticEntry,
  type OptimisticEntry,
  type OptimisticMachine,
} from "@/lib/actions/optimistic-machine";

type RunOptions<Result, State> = {
  errorMessage?: string;
  onError?: (message: string) => void;
  onSuccess?: (result: Result, optimisticState: State) => void;
  reconcile?: (result: Result, optimisticState: State) => State;
};

/**
 * Keeps confirmed client state plus an ordered queue of optimistic mutations.
 * Successful mutations remain visible while refreshed server props arrive;
 * failures remove only their own overlay. Settling in invocation order keeps
 * rapid edits deterministic even when their promises resolve out of order.
 */
export function useOptimisticAction<State, Input>({
  state,
  update,
  getKey,
}: {
  state: State;
  update: (current: State, input: Input) => State;
  getKey?: (input: Input) => string;
}) {
  const [machine, setMachine] = useState<OptimisticMachine<State, Input>>({
    source: state,
    confirmed: state,
    entries: [],
  });
  const machineRef = useRef(machine);
  const sequence = useRef(0);
  const [transitionPending, startTransition] = useTransition();

  if (state !== machine.source) {
    const rebased = { ...machine, source: state, confirmed: state };
    setMachine(rebased);
  }

  useLayoutEffect(() => {
    machineRef.current = machine;
  }, [machine]);

  const optimistic = optimisticVisibleState(machine, update);
  const pendingKeys = useMemo(
    () =>
      new Set(
        machine.entries
          .filter((entry) => entry.status === "pending" && entry.key)
          .map((entry) => entry.key as string)
      ),
    [machine.entries]
  );
  const pending =
    transitionPending || machine.entries.some((entry) => entry.status === "pending");

  const run = useCallback(
    <Result,>(
      input: Input,
      action: () => Promise<Result>,
      options: RunOptions<Result, State> = {}
    ) => {
      const request = ++sequence.current;
      const entry: OptimisticEntry<State, Input> = {
        id: request,
        input,
        key: getKey?.(input) ?? null,
        status: "pending",
        reconcile: options.reconcile
          ? (result, next) => options.reconcile?.(result as Result, next) ?? next
          : undefined,
      };

      const enqueued = {
        ...machineRef.current,
        entries: [...machineRef.current.entries, entry],
      };
      machineRef.current = enqueued;
      setMachine(enqueued);

      startTransition(async () => {
        try {
          const result = await action();
          const expectedError = mutationErrorMessage(result);
          if (expectedError) throw new Error(expectedError);
          const next = settleOptimisticEntry(
            machineRef.current,
            request,
            "succeeded",
            result,
            update
          );
          machineRef.current = next;
          setMachine(next);
          const reconciled = optimisticVisibleState(next, update);
          options.onSuccess?.(result, reconciled);
        } catch (error) {
          const next = settleOptimisticEntry(
            machineRef.current,
            request,
            "failed",
            undefined,
            update
          );
          machineRef.current = next;
          setMachine(next);
          const message = thrownMutationMessage(
            error,
            options.errorMessage ?? "That change could not be saved."
          );
          options.onError?.(message);
          toast.error(message);
        }
      });
    },
    [getKey, update]
  );

  const isPending = useCallback(
    (key: string) => pendingKeys.has(key),
    [pendingKeys]
  );

  return { state: optimistic, pending, pendingKeys, isPending, run };
}
