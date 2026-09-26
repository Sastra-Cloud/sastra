"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useUserActive } from "@/hooks/use-user-active";

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

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration failures are non-fatal */
    });

    const onChange = () => {
      if (hadController) promptUpdate();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
  }, []);

  // App-code deploys don't change the (static) service worker, so the
  // controllerchange path above won't fire for them. Poll a build-id endpoint
  // and prompt a refresh when the server's build changes — this is what saves an
  // open tab from a version-skew Server Action 404 after a deploy.
  useEffect(() => {
    let baseline: string | null = null;
    let notified = false;

    const check = async () => {
      // An idle tab stops asking so the server can sleep; it checks again on return.
      if (document.hidden || notified || !activeRef.current) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string };
        if (!id) return;
        if (baseline === null) {
          baseline = id;
        } else if (id !== baseline) {
          notified = true;
          promptUpdate();
        }
      } catch {
        /* offline / transient */
      }
    };

    checkRef.current = check;
    void check();
    const interval = setInterval(check, 60_000);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}

/** One shared, sticky "new build is live" toast (deduped by id). */
function promptUpdate() {
  toast("Update available", {
    id: "app-update",
    description: "A new version is ready — refresh to avoid errors.",
    action: { label: "Refresh", onClick: () => location.reload() },
    duration: Infinity,
  });
}
