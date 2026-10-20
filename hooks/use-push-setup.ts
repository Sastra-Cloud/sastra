"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  currentEndpoint,
  disablePush,
  enablePush,
  isIOS,
  isStandalone,
  permissionState,
  pushSupported,
} from "@/lib/push/client";
import {
  derivePushSetupState,
  type PushSetupState,
} from "@/lib/push/setup-state";
import { usePwaInstall } from "@/components/pwa/pwa-provider";

type Signals = {
  supported: boolean | null;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | null;
  hasEndpoint: boolean | null;
};

const INITIAL: Signals = {
  supported: null,
  ios: false,
  standalone: false,
  permission: null,
  hasEndpoint: null,
};

export type UsePushSetup = {
  state: PushSetupState;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission | null;
  macSafari: boolean;
  /** enable()/disable() in flight — the `ready` panel shows an "enabling" state. */
  busy: boolean;
  error: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  /** Re-read the browser signals (e.g. after returning from OS settings). */
  refresh: () => void;
};

/**
 * Gathers the browser push signals, derives the setup state, and exposes the
 * enable/disable actions. Installation is managed separately by PwaProvider.
 * Re-reads signals when the tab regains focus so
 * a user who unblocks notifications in OS/browser settings sees the UI update on
 * return without a manual reload.
 */
export function usePushSetup(): UsePushSetup {
  const { macSafari } = usePwaInstall();
  const [signals, setSignals] = useState<Signals>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(() => {
    setSignals((prev) => ({
      ...prev,
      ios: isIOS(),
      standalone: isStandalone(),
      permission: permissionState(),
    }));
    pushSupported()
      .then((supported) => setSignals((prev) => ({ ...prev, supported })))
      .catch(() => setSignals((prev) => ({ ...prev, supported: false })));
    currentEndpoint()
      .then((endpoint) =>
        setSignals((prev) => ({ ...prev, hasEndpoint: endpoint !== null }))
      )
      .catch(() => setSignals((prev) => ({ ...prev, hasEndpoint: false })));
  }, []);

  useEffect(() => {
    // Initial browser-signal read on mount (navigator/Notification are
    // client-only; currentEndpoint is async) — intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const onReturn = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [refresh]);

  const enable = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await enablePush();
      setSignals((prev) => ({
        ...prev,
        hasEndpoint: true,
        permission: permissionState(),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn on notifications.");
      // Reflect a declined native prompt so the flow shows recovery UI, not just
      // a raw error line.
      setSignals((prev) => ({ ...prev, permission: permissionState() }));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await disablePush();
      setSignals((prev) => ({ ...prev, hasEndpoint: false }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not turn off notifications."
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const state = derivePushSetupState(signals);

  return {
    state,
    ios: signals.ios,
    standalone: signals.standalone,
    permission: signals.permission,
    macSafari,
    busy,
    error,
    enable,
    disable,
    refresh,
  };
}
