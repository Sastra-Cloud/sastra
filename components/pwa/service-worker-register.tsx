"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useUserActive } from "@/hooks/use-user-active";
import { APP_UPDATE_EVENT, checkForAppUpdate, reloadForAppUpdate } from "@/lib/pwa/client-update";

/** Registers the service worker and surfaces a non-intrusive update toast. */
export function ServiceWorkerRegister() {
  const active = useUserActive();
  const activeRef = useRef(active);
  const checkRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    activeRef.current = active;
    if (active) void checkRef.current?.();
  }, [active]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // If there's no controller yet (first visit), the first controllerchange is
    // the initial registration — not an update — so don't toast for it.
    const hadController = navigator.serviceWorker.controller !== null;

    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      /* registration failures are non-fatal */
    });

    const onChange = () => {
      if (hadController) promptUpdate();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);

  // The static worker does not change with app-code deploys. Compare against
  // the build embedded in this window, never the first response after resuming.
  useEffect(() => {
    const check = async () => {
      if (!document.hidden && await checkForAppUpdate()) promptUpdate();
    };

    window.addEventListener(APP_UPDATE_EVENT, promptUpdate);
    checkRef.current = check;
    void check();
    const interval = setInterval(() => {
      if (activeRef.current) void check();
    }, 60_000);
    const onVisible = () => { void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      checkRef.current = null;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener(APP_UPDATE_EVENT, promptUpdate);
    };
  }, []);

  return null;
}

/** One shared, sticky "new build is live" toast (deduped by id). */
function promptUpdate() {
  toast("Update available", {
    id: "app-update",
    description: "Copy any unsaved work before refreshing. No changes will be sent again automatically.",
    action: { label: "Refresh app", onClick: () => {
      if (!reloadForAppUpdate()) {
        toast.error("Finish the current action before refreshing. Keep any unsaved work.");
      }
    } },
    duration: Infinity,
  });
}
