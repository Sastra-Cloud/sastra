"use client";

import { useState, useSyncExternalStore, type ComponentProps } from "react";
import Link from "next/link";

type Props = ComponentProps<typeof Link> & { eager?: boolean };

type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
function connection() {
  return (navigator as Navigator & { connection?: Connection }).connection;
}

function canPrefetch() {
  const network = connection();
  return navigator.onLine && !network?.saveData && !/^(slow-)?2g$/.test(network?.effectiveType ?? "");
}

function subscribeToNetwork(callback: () => void) {
  const network = connection();
  network?.addEventListener("change", callback);
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    network?.removeEventListener("change", callback);
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const noSubscription = () => () => {};
const serverSnapshot = () => false;

/** Full route prefetch on intent; only the small daily navigation opts in eagerly. */
export function NavigationLink({
  eager = false,
  prefetch,
  onPointerEnter,
  onTouchStart,
  onFocus,
  ...props
}: Props) {
  const [intentHref, setIntentHref] = useState<Props["href"] | null>(null);
  const allowed = useSyncExternalStore(eager ? subscribeToNetwork : noSubscription, canPrefetch, serverSnapshot);

  function warm() {
    // Honor data saving and slow connections for speculative full-page work.
    if (!canPrefetch()) return;
    setIntentHref(props.href);
  }

  return (
    <Link
      {...props}
      prefetch={prefetch === undefined ? (allowed && (eager || intentHref === props.href) ? true : null) : prefetch}
      onPointerEnter={(event) => { onPointerEnter?.(event); if (!event.defaultPrevented) warm(); }}
      onTouchStart={(event) => { onTouchStart?.(event); if (!event.defaultPrevented) warm(); }}
      onFocus={(event) => { onFocus?.(event); if (!event.defaultPrevented) warm(); }}
    />
  );
}
