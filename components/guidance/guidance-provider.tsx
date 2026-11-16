"use client";

import { toast } from "sonner";
import * as React from "react";
import { Suspense, use } from "react";

import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import {
  dismissGuidanceKey,
  restoreGuidanceKey,
  resetGuidanceTips,
} from "@/lib/guidance/actions";
import {
  guidanceMutationKey,
  updateGuidanceDismissals,
  type GuidanceMutation,
} from "@/lib/guidance/state";

/** What the server knows about this person's coaching state. */
export type GuidanceSnapshot = {
  dismissedKeys: string[];
  /** The person has asked the assistant something before; skip its intro. */
  assistantIntroduced: boolean;
};

type GuidanceContextValue = {
  /** Global switch from the user's profile preference. */
  enabled: boolean;
  /**
   * True once the account's dismissals are known. Until then no coaching is
   * shown, so a tip the person already hid can never flash on screen.
   */
  hydrated: boolean;
  /** Treated as true until the snapshot arrives, so the intro never flashes. */
  assistantIntroduced: boolean;
  /** Has the user dismissed this specific coaching element before? */
  isDismissed: (key: string) => boolean;
  /** Permanently dismiss one coaching element for this user. */
  dismiss: (key: string) => void;
  /** Bring back a dismissed element (used by a future "reset guidance"). */
  restore: (key: string) => void;
  reset: () => void;
  pending: boolean;
};

const GuidanceContext = React.createContext<GuidanceContextValue | null>(null);

/**
 * Applies a streamed server value once it arrives. It suspends only itself, so
 * the page behind the provider never waits for the value.
 */
function SnapshotReceiver<T>({
  promise,
  onSettled,
}: {
  promise: Promise<T>;
  onSettled: (value: T) => void;
}) {
  const value = use(promise);
  React.useEffect(() => {
    onSettled(value);
  }, [value, onSettled]);
  return null;
}

/**
 * `snapshot` is streamed after the first paint and resolves to `null` when the
 * server could not load it. Then coaching simply stays hidden.
 */
export function GuidanceProvider({
  enabled,
  snapshot,
  children,
}: {
  enabled: boolean;
  snapshot: Promise<GuidanceSnapshot | null>;
  children: React.ReactNode;
}) {
  const [loaded, setLoaded] = React.useState<GuidanceSnapshot | null>(null);
  const receive = React.useCallback((next: GuidanceSnapshot | null) => {
    if (next) setLoaded(next);
  }, []);
  const initialDismissals = React.useMemo(
    () => new Set(loaded?.dismissedKeys ?? []),
    [loaded]
  );
  const { state: dismissedKeys, run, pending } = useOptimisticAction<
    ReadonlySet<string>,
    GuidanceMutation
  >({
    state: initialDismissals,
    update: updateGuidanceDismissals,
    getKey: guidanceMutationKey,
  });

  const dismiss = React.useCallback(
    (guidanceKey: string) => {
      if (dismissedKeys.has(guidanceKey)) return;
      run(
        { guidanceKey, dismissed: true },
        () => dismissGuidanceKey(guidanceKey),
        { errorMessage: "Couldn't hide that guidance item." }
      );
    },
    [dismissedKeys, run]
  );
  const restore = React.useCallback(
    (guidanceKey: string) => {
      if (!dismissedKeys.has(guidanceKey)) return;
      run(
        { guidanceKey, dismissed: false },
        () => restoreGuidanceKey(guidanceKey),
        { errorMessage: "Couldn't restore that guidance item." }
      );
    },
    [dismissedKeys, run]
  );
  const reset = React.useCallback(() => {
    if (pending) return;
    run({ guidanceKey: "reset", dismissed: false, reset: true }, resetGuidanceTips, {
      errorMessage: "Couldn't restore your tips. Try again.",
      onSuccess: () => toast.success("Hidden tips are visible again."),
    });
  }, [pending, run]);
  const value = React.useMemo<GuidanceContextValue>(
    () => ({
      enabled,
      hydrated: loaded !== null,
      assistantIntroduced: loaded?.assistantIntroduced ?? true,
      isDismissed: (guidanceKey) => dismissedKeys.has(guidanceKey),
      dismiss,
      restore,
      reset,
      pending,
    }),
    [dismiss, dismissedKeys, enabled, loaded, restore, reset, pending]
  );
  return (
    <GuidanceContext.Provider value={value}>
      <Suspense fallback={null}>
        <SnapshotReceiver promise={snapshot} onSettled={receive} />
      </Suspense>
      {children}
    </GuidanceContext.Provider>
  );
}

/**
 * Read the guidance state. Safe outside a provider (defaults to guidance off)
 * so components can be used in isolation or in tests without wiring the tree.
 */
export function useGuidance(): GuidanceContextValue {
  const ctx = React.useContext(GuidanceContext);
  return ctx ?? {
    enabled: false,
    hydrated: true,
    assistantIntroduced: true,
    isDismissed: () => false,
    dismiss: () => undefined,
    restore: () => undefined,
    reset: () => undefined,
    pending: false,
  };
}

/**
 * Convenience for a single dismissible element: returns whether to show it and a
 * one-call dismiss. Shows only when guidance is on, hydrated, and not dismissed.
 */
export function useGuidedElement(key: string): {
  show: boolean;
  dismiss: () => void;
} {
  const { enabled, hydrated, isDismissed, dismiss } = useGuidance();
  return {
    show: enabled && hydrated && !isDismissed(key),
    dismiss: React.useCallback(() => dismiss(key), [dismiss, key]),
  };
}
