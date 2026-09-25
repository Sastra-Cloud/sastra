"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { setPresenceStatus } from "@/lib/presence/actions";
import type { ManualStatus, PresenceStatus } from "@/lib/presence/status";

type PresenceMap = Record<string, PresenceStatus>;

type PresenceContextValue = {
  statuses: PresenceMap;
  selfId: string | null;
  setManual: (status: ManualStatus) => void;
};

const PresenceContext = createContext<PresenceContextValue>({
  statuses: {},
  selfId: null,
  setManual: () => {},
});

const HEARTBEAT_MS = 30_000;
const POLL_MS = 30_000;

export function PresenceProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [statuses, setStatuses] = useState<PresenceMap>({});

  // Heartbeat: report activity while the tab is visible.
  useEffect(() => {
    let stopped = false;
    const beat = (visible: boolean) => {
      if (stopped) return;
      fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
        keepalive: true,
      }).catch(() => {});
    };
    beat(!document.hidden);
    const iv = setInterval(() => {
      if (!document.hidden) beat(true);
    }, HEARTBEAT_MS);
    const onVisibility = () => beat(!document.hidden);
    const onHide = () => {
      const blob = new Blob([JSON.stringify({ visible: false })], {
        type: "application/json",
      });
      navigator.sendBeacon?.("/api/presence/heartbeat", blob);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      stopped = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  // Poll everyone's presence.
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/presence");
      if (!r.ok) return;
      const d = await r.json();
      setStatuses(d.statuses ?? {});
    } catch {
      // transient — keep the last known map
    }
  }, []);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const setManual = useCallback(
    (status: ManualStatus) => {
      // Optimistic for the user's own dot, then persist + re-sync.
      setStatuses((prev) => ({
        ...prev,
        [userId]: status === "offline" ? "offline" : status === "away" ? "away" : "online",
      }));
      setPresenceStatus(status)
        .then(() => refresh())
        .catch(() => refresh());
    },
    [userId, refresh]
  );

  return (
    <PresenceContext.Provider value={{ statuses, selfId: userId, setManual }}>
      {children}
    </PresenceContext.Provider>
  );
}

/** Live status for a user (defaults to "offline" without a provider). */
export function usePresence(userId: string | null | undefined): PresenceStatus {
  const { statuses } = useContext(PresenceContext);
  if (!userId) return "offline";
  return statuses[userId] ?? "offline";
}

/** Controls for the current user's own presence. */
export function usePresenceControls() {
  const { selfId, statuses, setManual } = useContext(PresenceContext);
  const self: PresenceStatus = selfId ? statuses[selfId] ?? "online" : "offline";
  return { self, setManual };
}
