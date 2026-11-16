"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { VoicePlayer } from "@/lib/chat/voice-player";

const Context = createContext<VoicePlayer | null>(null);

export function VoicePlaybackProvider({ children }: { children: ReactNode }) {
  const [player] = useState(() => new VoicePlayer());
  useEffect(() => player.connect(), [player]);
  useEffect(() => {
    const visible = () => { if (!document.hidden) player.reconcile(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pageshow", visible);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pageshow", visible);
    };
  }, [player]);
  return <Context.Provider value={player}>{children}</Context.Provider>;
}

export function useVoicePlayer() {
  const player = useContext(Context);
  if (!player) throw new Error("Voice messages require VoicePlaybackProvider.");
  return player;
}
