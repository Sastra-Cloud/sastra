"use client";

import { CheckCircle2, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type OutgoingEmailDelivery = {
  status: "sending" | "sent";
  label: string;
  recipient: string;
  sentAt?: string | null;
};

export function OutgoingEmailStatus({
  delivery,
  className,
}: {
  delivery: OutgoingEmailDelivery | null;
  className?: string;
}) {
  if (!delivery) return null;

  const sent = delivery.status === "sent";
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        sent
          ? "border-success/30 bg-success/5 text-foreground"
          : "border-primary/25 bg-primary/5 text-foreground",
        className
      )}
    >
      {sent ? (
        <CheckCircle2
          className="mt-0.5 size-4 shrink-0 text-success"
          aria-hidden="true"
        />
      ) : (
        <Loader2
          className="mt-0.5 size-4 shrink-0 animate-spin text-primary"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0">
        <p className="font-medium">
          {sent ? `${delivery.label} sent` : `Sending ${delivery.label.toLowerCase()}…`}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {sent ? "Sent" : "Sending"} to {delivery.recipient}
          {sent && delivery.sentAt
            ? ` · ${new Date(delivery.sentAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}`
            : ""}
        </p>
      </div>
    </div>
  );
}
