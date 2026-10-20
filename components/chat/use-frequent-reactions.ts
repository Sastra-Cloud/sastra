"use client";

import { useCallback, useEffect, useState } from "react";
import { reactionSuggestions } from "@/lib/chat/reaction-suggestions";

export function useFrequentReactions(userId: string) {
  const [usage, setUsage] = useState<{ userId: string; emojis: string[] } | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/chat/reactions", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && Array.isArray(data.emojis)) {
          setUsage({ userId, emojis: data.emojis.filter((item: unknown): item is string => typeof item === "string") });
        }
      }).catch(() => { /* Defaults remain available if the personal list cannot load. */ });
    return () => controller.abort();
  }, [userId, revision]);
  return { emojis: reactionSuggestions(usage?.userId === userId ? usage.emojis : []), refresh };
}
