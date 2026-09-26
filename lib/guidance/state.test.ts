import { describe, expect, it } from "vitest";

import {
  optimisticVisibleState,
  settleOptimisticEntry,
  type OptimisticMachine,
} from "@/lib/actions/optimistic-machine";
import {
  updateGuidanceDismissals,
  type GuidanceMutation,
} from "./state";

function machineFor(
  mutation: GuidanceMutation
): OptimisticMachine<ReadonlySet<string>, GuidanceMutation> {
  const initial = new Set<string>();
  return {
    source: initial,
    confirmed: initial,
    entries: [
      {
        id: 1,
        input: mutation,
        key: mutation.guidanceKey,
        status: "pending",
      },
    ],
  };
}

describe("user guidance dismissal state", () => {
  it("hides immediately and keeps the dismissal after server success", () => {
    const mutation = { guidanceKey: "budget-whats-next", dismissed: true };
    const pending = machineFor(mutation);

    expect(
      optimisticVisibleState(pending, updateGuidanceDismissals).has(
        mutation.guidanceKey
      )
    ).toBe(true);

    const settled = settleOptimisticEntry(
      pending,
      1,
      "succeeded",
      { ok: true },
      updateGuidanceDismissals
    );
    expect(
      optimisticVisibleState(settled, updateGuidanceDismissals).has(
        mutation.guidanceKey
      )
    ).toBe(true);
  });

  it("rolls the dismissal back exactly when saving fails", () => {
    const mutation = { guidanceKey: "print-whats-next", dismissed: true };
    const pending = machineFor(mutation);
    const settled = settleOptimisticEntry(
      pending,
      1,
      "failed",
      undefined,
      updateGuidanceDismissals
    );

    expect(
      optimisticVisibleState(settled, updateGuidanceDismissals).has(
        mutation.guidanceKey
      )
    ).toBe(false);
  });

  it("restores only the requested guidance key", () => {
    const initial = new Set(["first", "second"]);
    const restored = updateGuidanceDismissals(initial, {
      guidanceKey: "first",
      dismissed: false,
    });

    expect([...restored]).toEqual(["second"]);
    expect([...initial]).toEqual(["first", "second"]);
  });
});

it("restores hidden tips immediately and rolls back the whole reset on failure", () => {
  const initial = new Set(["tip", "onboarding:dismissed", "onboarding:item:work"]);
  const pending = machineFor({ guidanceKey: "reset", dismissed: false, reset: true });
  pending.source = initial; pending.confirmed = initial;
  expect([...optimisticVisibleState(pending, updateGuidanceDismissals)]).toEqual(["onboarding:item:work"]);
  const failed = settleOptimisticEntry(pending, 1, "failed", undefined, updateGuidanceDismissals);
  expect(optimisticVisibleState(failed, updateGuidanceDismissals)).toEqual(initial);
  const success = settleOptimisticEntry(pending, 1, "succeeded", { ok: true }, updateGuidanceDismissals);
  expect([...optimisticVisibleState(success, updateGuidanceDismissals)]).toEqual(["onboarding:item:work"]);
});
