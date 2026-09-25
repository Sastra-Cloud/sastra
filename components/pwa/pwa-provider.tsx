"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { syncSubscription } from "@/lib/push/client";

/** Chrome/Android fires this so we can offer a custom "Install app" button. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

type PwaState = { canInstall: boolean; installed: boolean };

// --- Module-scope install-prompt store ---------------------------------------
// `beforeinstallprompt` can fire before React hydrates, so we must capture it at
// import time (not inside an effect) or we miss it entirely.

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let syncedThisSession = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function currentState(): PwaState {
  return { canInstall: deferredPrompt !== null && !installed, installed };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress the browser's automatic mini-infobar; we surface our own button.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

async function promptInstall(): Promise<InstallOutcome> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  // A deferred prompt may only be used once — clear it regardless of outcome.
  deferredPrompt = null;
  emit();
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice.outcome;
  } catch {
    return "dismissed";
  }
}

// --- React context -----------------------------------------------------------

type PwaContextValue = PwaState & {
  promptInstall: () => Promise<InstallOutcome>;
};

const PwaContext = createContext<PwaContextValue>({
  canInstall: false,
  installed: false,
  promptInstall: async () => "unavailable",
});

/** Access install-prompt state captured before hydration. */
export function usePwaInstall(): PwaContextValue {
  return useContext(PwaContext);
}

/**
 * Provides `beforeinstallprompt` state to the tree and performs a once-per-page
 * re-sync of this device's push subscription with the server (healing drift
 * after server-side pruning). Mount once, high in the app layout.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PwaState>(() => currentState());

  useEffect(() => {
    // Re-read in case an event fired between module init and this mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(currentState());
    const cb = () => setState(currentState());
    listeners.add(cb);

    if (!syncedThisSession) {
      syncedThisSession = true;
      void syncSubscription();
    }

    return () => {
      listeners.delete(cb);
    };
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({ ...state, promptInstall }),
    [state]
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}
