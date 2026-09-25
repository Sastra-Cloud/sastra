"use client";

import { useState } from "react";
import { Monitor, Smartphone, Trash2 } from "lucide-react";

import { removePushDevice } from "@/lib/notifications/actions";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PushDevice = {
  id: string;
  userAgent: string | null;
  lastSeenAt: string; // ISO
};

/** Coarse, human label from a user-agent string: "Android · Chrome". */
export function describeUserAgent(ua: string | null): {
  label: string;
  kind: "phone" | "desktop";
} {
  if (!ua) return { label: "Unknown device", kind: "desktop" };

  let platform = "Device";
  let kind: "phone" | "desktop" = "desktop";
  if (/iPhone/.test(ua)) {
    platform = "iPhone";
    kind = "phone";
  } else if (/iPad/.test(ua)) {
    platform = "iPad";
    kind = "phone";
  } else if (/Android/.test(ua)) {
    platform = "Android";
    kind = "phone";
  } else if (/Macintosh|Mac OS/.test(ua)) {
    platform = "Mac";
  } else if (/Windows/.test(ua)) {
    platform = "Windows";
  } else if (/Linux/.test(ua)) {
    platform = "Linux";
  }

  // Order matters: Chrome/Firefox on iOS and Chrome on desktop all contain
  // "Safari"; check the specific tokens first.
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/CriOS|Chrome\//.test(ua)) browser = "Chrome";
  else if (/FxiOS|Firefox/.test(ua)) browser = "Firefox";
  else if (/Safari/.test(ua)) browser = "Safari";

  return { label: `${platform} · ${browser}`, kind };
}

export function PushDevices({ devices }: { devices: PushDevice[] }) {
  const { state, run } = useOptimisticAction<PushDevice[], string>({
    state: devices,
    update: (list, id) => list.filter((d) => d.id !== id),
  });
  const [pendingRemoval, setPendingRemoval] = useState<PushDevice | null>(null);

  function confirmRemove() {
    const device = pendingRemoval;
    if (!device) return;
    setPendingRemoval(null);
    run(device.id, () => removePushDevice(device.id), {
      errorMessage: "Could not remove that device.",
    });
  }

  if (state.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Devices receiving push
      </p>
      <ul className="divide-y rounded-lg border">
        {state.map((device) => {
          const { label, kind } = describeUserAgent(device.userAgent);
          const Icon = kind === "phone" ? Smartphone : Monitor;
          return (
            <li key={device.id} className="flex items-center gap-3 px-3 py-2">
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{label}</span>
                <span className="block text-xs text-muted-foreground">
                  Last active {timeAgo(device.lastSeenAt)}
                </span>
              </span>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${label}`}
                onClick={() => setPendingRemoval(device)}
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove this device?</DialogTitle>
            <DialogDescription>
              {pendingRemoval
                ? `${describeUserAgent(pendingRemoval.userAgent).label} will stop receiving push notifications until it's turned on again from that device.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
