"use client";

import { createContext, useEffect, useState, type ReactNode } from "react";
import { createFrequentReactionsCache } from "@/lib/chat/frequent-reactions-cache";

export const FrequentReactionsContext = createContext<ReturnType<typeof createFrequentReactionsCache> | null>(null);

/** Keyed by account in AppShell, so navigation reuses data and signing out drops it. */
export function FrequentReactionsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [cache] = useState(() => createFrequentReactionsCache(userId));
  useEffect(() => () => cache.clear(), [cache]);
  return <FrequentReactionsContext value={cache}>{children}</FrequentReactionsContext>;
}
