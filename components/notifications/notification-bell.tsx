"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";
import { setAppBadge } from "@/lib/push/client";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notifications/client-events";
import { useUserActive } from "@/hooks/use-user-active";

type Item = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  project: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);

  const load = async () => {
    try {
      const r = await fetch("/api/notifications/recent");
      if (r.ok) {
        const d = await r.json();
        setUnread(d.unread);
        setItems(d.items);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
  }, []);

  // Refresh every 20 seconds while the user is active. An idle or hidden tab
  // stops asking (push notifications still arrive), and catches up at once
  // when the user comes back.
  const active = useUserActive();
  useEffect(() => {
    if (!active) return;
    const now = window.setTimeout(() => void load(), 0);
    const i = setInterval(() => {
      if (!document.hidden) void load();
    }, 20000);
    return () => {
      clearTimeout(now);
      clearInterval(i);
    };
  }, [active]);

  // Keep the installed-app icon badge in sync with the unread count from the
  // foreground (the service worker sets it on push delivery). Reading an item or
  // "Mark all read" decrements/clears it; a fresh load reconciles any drift.
  useEffect(() => {
    setAppBadge(unread);
  }, [unread]);

  const openItem = async (it: Item) => {
    // Opening work must not wait for the read-receipt request or refresh the old route.
    if (it.link) {
      setOpen(false);
      router.push(it.link);
    }
    if (!it.readAt) {
      setUnread((u) => Math.max(0, u - 1));
      setItems((arr) =>
        arr.map((x) => (x.id === it.id ? { ...x, readAt: new Date().toISOString() } : x))
      );
      try {
        await markNotificationRead(it.id);
      } catch {
        setUnread((u) => u + 1);
        setItems((arr) => arr.map((x) => (x.id === it.id ? it : x)));
        toast.error("Could not mark the notification as read.");
      }
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => { setOpen(open); if (open) void load(); }}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative" />
        }
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span
            aria-live="polite"
            className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium tabular-nums text-destructive-foreground"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={async () => {
                const previousUnread = unread;
                const previousItems = items;
                setUnread(0);
                setItems((arr) =>
                  arr.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() }))
                );
                try {
                  await markAllNotificationsRead();
                } catch {
                  setUnread(previousUnread);
                  setItems(previousItems);
                  toast.error("Could not mark notifications as read.");
                }
              }}
            >
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </p>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => openItem(it)}
                className={cn(
                  "flex w-full items-start gap-2 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50",
                  !it.readAt && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    it.readAt ? "bg-transparent" : "bg-primary"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {it.project ? (
                    <span className="block truncate text-[11px] font-medium text-muted-foreground">
                      {it.project}
                    </span>
                  ) : null}
                  <span className="block text-sm font-medium">{it.title}</span>
                  {it.body ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {it.body}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(it.createdAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
