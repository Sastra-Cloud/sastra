"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";

import { usePushSetup } from "@/hooks/use-push-setup";
import { EnablePushFlow } from "@/components/pwa/enable-push-flow";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

const SNOOZE_KEY = "sastra:push-nudge:snoozed-until";
const SNOOZE_DAYS = 30;

/**
 * Dashboard prompt encouraging users who haven't enabled push to install and/or
 * turn it on. Per-device by design, so dismissal is a localStorage snooze (30
 * days), not a DB flag. Shows only when there's a useful action to take
 * (`ready` or `ios-needs-install`) — never for already-enabled, unsupported, or
 * blocked devices (settings owns denied recovery; nagging blocked users is
 * counterproductive).
 */
export function PushNudge() {
  const setup = usePushSetup();
  // null → snooze status not yet read (avoid a flash before the check resolves).
  const [snoozed, setSnoozed] = useState<boolean | null>(null);

  useEffect(() => {
    let isSnoozed = true; // fail closed if localStorage is unavailable
    try {
      const raw = localStorage.getItem(SNOOZE_KEY);
      if (!raw) {
        isSnoozed = false;
      } else {
        const until = Date.parse(raw);
        isSnoozed = Number.isFinite(until) && until > Date.now();
      }
    } catch {
      // localStorage blocked (private mode, etc.) → leave snoozed, no nudge.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnoozed(isSnoozed);
  }, []);

  function dismiss() {
    try {
      const until = new Date(
        Date.now() + SNOOZE_DAYS * 86_400_000
      ).toISOString();
      localStorage.setItem(SNOOZE_KEY, until);
    } catch {
      /* ignore — we still hide it for this session below */
    }
    setSnoozed(true);
  }

  if (snoozed === null || snoozed) return null;
  if (setup.state !== "ready" && setup.state !== "ios-needs-install") return null;

  return (
    <Reveal className="surface-shadow relative rounded-xl border bg-card p-4">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute top-2 right-2 text-muted-foreground"
      >
        <X />
      </Button>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 pr-8">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <BellRing className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-heading font-semibold">Turn on notifications</h2>
            <p className="text-xs text-muted-foreground text-pretty">
              Stay on top of task assignments, @mentions, and blockers — even
              when Sastra is closed.
            </p>
          </div>
        </div>
        <EnablePushFlow variant="card" />
      </div>
    </Reveal>
  );
}
