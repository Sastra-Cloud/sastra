"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { useUserActive } from "@/hooks/use-user-active";
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

  const active = useUserActive();

  // Heartbeat: report activity every 30 seconds while the user is active. When
  // they go idle or hide the tab, send one "away" beat and stop, so an
  // unattended tab does not keep the server and database awake.
  useEffect(() => {
    const beat = (visible: boolean) => {
      fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible }),
        keepalive: true,
      }).catch(() => {});
    };
    if (!active) {
      beat(false);
      return;
    }
    beat(true);
    const iv = setInterval(() => beat(true), HEARTBEAT_MS);
    return () => clearInterval(iv);
  }, [active]);

  useEffect(() => {
    const onHide = () => {
      const blob = new Blob([JSON.stringify({ visible: false })], {
        type: "application/json",
      });
      navigator.sendBeacon?.("/api/presence/heartbeat", blob);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Poll everyone's presence while the user is active.
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
    if (!active) return;
    const first = window.setTimeout(() => void refresh(), 0);
    const iv = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [active, refresh]);

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
