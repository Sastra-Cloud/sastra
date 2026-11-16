"use client";

import { useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { reactionSuggestions } from "@/lib/chat/reaction-suggestions";
import { FrequentReactionsContext } from "./frequent-reactions-provider";

const emptySnapshot = () => null;
const emptySubscribe = () => () => {};

export function useFrequentReactions(userId: string) {
  const context = useContext(FrequentReactionsContext);
  const cache = context?.userId === userId ? context : null;
  const emojis = useSyncExternalStore(cache?.subscribe ?? emptySubscribe, cache?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const refresh = useCallback(() => { void cache?.load(true); }, [cache]);
  useEffect(() => {
    void cache?.load();
    const revalidate = () => { void cache?.load(); };
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    return () => { window.removeEventListener("focus", revalidate); window.removeEventListener("online", revalidate); };
  }, [cache]);
  const suggestions = useMemo(() => reactionSuggestions(emojis ?? []), [emojis]);
  return { emojis: suggestions, refresh };
}
