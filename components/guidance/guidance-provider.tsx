"use client";

import * as React from "react";

import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import {
  dismissGuidanceKey,
  restoreGuidanceKey,
} from "@/lib/guidance/actions";
import {
  guidanceMutationKey,
  updateGuidanceDismissals,
  type GuidanceMutation,
} from "@/lib/guidance/state";

type GuidanceContextValue = {
  /** Global switch from the user's profile preference. */
  enabled: boolean;
  /** Always true; account dismissals arrive with the server-rendered layout. */
  hydrated: boolean;
  /** Has the user dismissed this specific coaching element before? */
  isDismissed: (key: string) => boolean;
  /** Permanently dismiss one coaching element for this user. */
  dismiss: (key: string) => void;
  /** Bring back a dismissed element (used by a future "reset guidance"). */
  restore: (key: string) => void;
};

const GuidanceContext = React.createContext<GuidanceContextValue | null>(null);

export function GuidanceProvider({
  enabled,
  initialDismissedKeys,
  children,
}: {
  enabled: boolean;
  initialDismissedKeys: string[];
  children: React.ReactNode;
}) {
  const initialDismissals = React.useMemo(
    () => new Set(initialDismissedKeys),
    [initialDismissedKeys]
  );
  const { state: dismissedKeys, run } = useOptimisticAction<
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
  const value = React.useMemo<GuidanceContextValue>(
    () => ({
      enabled,
      hydrated: true,
      isDismissed: (guidanceKey) => dismissedKeys.has(guidanceKey),
      dismiss,
      restore,
    }),
    [dismiss, dismissedKeys, enabled, restore]
  );
  return (
    <GuidanceContext.Provider value={value}>{children}</GuidanceContext.Provider>
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
    isDismissed: () => false,
    dismiss: () => undefined,
    restore: () => undefined,
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
