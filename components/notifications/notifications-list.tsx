"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  title: string;
  body: string | null;
  project: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationsList({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const hasUnread = items.some((i) => !i.readAt);

  const open = async (it: Item) => {
    // Opening work must not wait for the read-receipt request or refresh the old route.
    if (it.link) {
      router.push(it.link);
    }
    if (!it.readAt) {
      setItems((arr) =>
        arr.map((x) => (x.id === it.id ? { ...x, readAt: "now" } : x))
      );
      try {
        await markNotificationRead(it.id);
      } catch {
        setItems((arr) => arr.map((x) => (x.id === it.id ? it : x)));
        toast.error("Could not mark the notification as read.");
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Notifications
        </h1>
        {hasUnread ? (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const previous = items;
              setItems((arr) => arr.map((x) => ({ ...x, readAt: x.readAt ?? "now" })));
              try {
                await markAllNotificationsRead();
              } catch {
                setItems(previous);
                toast.error("Could not mark notifications as read.");
              }
            }}
          >
            Mark all read
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border bg-card py-14 text-center text-sm text-muted-foreground">
          You&apos;re all caught up.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => open(it)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50",
                  !it.readAt && "bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2 shrink-0 rounded-full",
                    it.readAt ? "bg-transparent" : "bg-primary"
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  {it.project ? (
                    <span className="block truncate text-xs font-medium text-muted-foreground">
                      {it.project}
                    </span>
                  ) : null}
                  <span className="block font-medium">{it.title}</span>
                  {it.body ? (
                    <span className="block text-sm text-muted-foreground">
                      {it.body}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(it.createdAt).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
