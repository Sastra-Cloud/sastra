"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function shouldResetScrollAfterNavigation({
  previousPathname,
  pathname,
  historyTargetPathname,
  hash,
}: {
  previousPathname: string;
  pathname: string;
  historyTargetPathname: string | null;
  hash: string;
}) {
  return (
    previousPathname !== pathname &&
    historyTargetPathname !== pathname &&
    hash.length === 0
  );
}

/**
 * Starts forward route changes at the beginning of the new screen while
 * preserving the browser's Back/Forward restoration and hash-link behavior.
 */
export function RouteScrollManager() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const historyTargetPathname = useRef<string | null>(null);

  useEffect(() => {
    function markHistoryNavigation() {
      historyTargetPathname.current = window.location.pathname;
    }

    window.addEventListener("popstate", markHistoryNavigation);
    return () => window.removeEventListener("popstate", markHistoryNavigation);
  }, []);

  useLayoutEffect(() => {
    const previous = previousPathname.current;
    const historyTarget = historyTargetPathname.current;

    previousPathname.current = pathname;
    historyTargetPathname.current = null;

    if (
      !shouldResetScrollAfterNavigation({
        previousPathname: previous,
        pathname,
        historyTargetPathname: historyTarget,
        hash: window.location.hash,
      })
    ) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
