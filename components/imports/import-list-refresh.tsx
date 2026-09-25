"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { resumeStalledImports } from "@/lib/imports/actions";

/**
 * Keeps the import list live while anything is still parsing: refreshes the
 * server component every few seconds (so finished/failed parses appear without a
 * manual reload) and periodically re-kicks parses that stalled. Pauses while the
 * tab is hidden; stops once nothing is in flight (parent re-renders active=false).
 */
export function ImportListRefresh({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let ticks = 0;

    // Heal anything already stuck the moment the page is opened.
    void resumeStalledImports().catch(() => {});

    const iv = setInterval(async () => {
      if (stopped || document.hidden) return;
      ticks += 1;
      // Re-check for stalled parses roughly every 10s (every 3rd 3s tick).
      if (ticks % 3 === 0) {
        await resumeStalledImports().catch(() => {});
      }
      router.refresh();
    }, 3000);

    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [active, router]);

  return null;
}
