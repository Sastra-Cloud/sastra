"use client";

import { Mail } from "lucide-react";
import { useMemo } from "react";

import {
  setEmailPreference,
  updateEmailDeliverySettings,
} from "@/lib/notifications/actions";
import type { EmailDeliveryMode } from "@/lib/notifications/email-policy";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
import { cn } from "@/lib/utils";

const replaceBoolean = (_current: boolean, next: boolean) => next;

type DeliveryState = {
  mode: EmailDeliveryMode;
  digestTimeMinutes: number;
};

const DELIVERY_OPTIONS: Array<{
  mode: EmailDeliveryMode;
  label: string;
  description: string;
}> = [
  {
    mode: "bundled",
    label: "Bundled",
    description: "Collect nearby updates and send them together about every five minutes.",
  },
  {
    mode: "daily",
    label: "Daily digest",
    description: "Send one weekday summary at the time you choose.",
  },
  {
    mode: "immediate",
    label: "Immediate",
    description: "Send one email for every notification as soon as the worker runs.",
  },
];

function minutesToTime(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return Math.min(1439, Math.max(0, (hour || 0) * 60 + (minute || 0)));
}

function updateDelivery(current: DeliveryState, next: Partial<DeliveryState>): DeliveryState {
  return { ...current, ...next };
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        className="size-5 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

export function NotificationPrefs({
  workflowOptIn,
  standupOptIn,
  emailDeliveryMode,
  emailDigestTimeMinutes,
  timezone,
}: {
  workflowOptIn: boolean;
  standupOptIn: boolean;
  emailDeliveryMode: EmailDeliveryMode;
  emailDigestTimeMinutes: number;
  timezone: string;
}) {
  const workflow = useOptimisticAction({ state: workflowOptIn, update: replaceBoolean });
  const standup = useOptimisticAction({ state: standupOptIn, update: replaceBoolean });
  const initialDelivery = useMemo(
    () => ({
      mode: emailDeliveryMode,
      digestTimeMinutes: emailDigestTimeMinutes,
    }),
    [emailDeliveryMode, emailDigestTimeMinutes]
  );
  const delivery = useOptimisticAction<DeliveryState, Partial<DeliveryState>>({
    state: initialDelivery,
    update: updateDelivery,
  });

  const updateCategory = (category: "workflow" | "standup", value: boolean) => {
    const mutation = category === "workflow" ? workflow : standup;
    mutation.run(value, () => setEmailPreference(category, value), {
      errorMessage: "Could not save the email preference.",
    });
  };

  const updateSchedule = (next: Partial<DeliveryState>) => {
    const optimistic = updateDelivery(delivery.state, next);
    delivery.run(
      next,
      () => updateEmailDeliverySettings(optimistic),
      { errorMessage: "Could not save the email schedule." }
    );
  };

  return (
    <Card>
      <CardContent className="space-y-5 py-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Mail className="size-4" />
            Notification email
          </p>
          <p className="text-sm text-muted-foreground">
            In-app and push notifications stay immediate. Essential account and
            explicitly sent operational email always bypass this schedule.
          </p>
        </div>

        <fieldset className="space-y-2" disabled={delivery.pending}>
          <legend className="text-sm font-medium">Email frequency</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DELIVERY_OPTIONS.map((option) => {
              const selected = delivery.state.mode === option.mode;
              return (
                <label
                  key={option.mode}
                  className={cn(
                    "flex min-h-24 cursor-pointer items-start gap-2.5 rounded-xl p-3 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40",
                    selected && "bg-primary/5 ring-primary/40"
                  )}
                >
                  <input
                    type="radio"
                    name="email-delivery-mode"
                    value={option.mode}
                    checked={selected}
                    onChange={() => updateSchedule({ mode: option.mode })}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Direct @mention emails are sent right away when workflow emails are on.
          </p>
        </fieldset>

        {delivery.state.mode === "daily" ? (
          <div className="grid gap-1.5 border-t pt-4 sm:max-w-xs">
            <Label htmlFor="email-digest-time">Weekday digest time</Label>
            <Input
              id="email-digest-time"
              type="time"
              value={minutesToTime(delivery.state.digestTimeMinutes)}
              disabled={delivery.pending}
              onChange={(event) =>
                updateSchedule({ digestTimeMinutes: timeToMinutes(event.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Monday–Friday in {timezone}. Weekend updates wait until Monday.
            </p>
          </div>
        ) : null}

        <div className="divide-y border-t pt-1">
          <Toggle
            label="Workflow emails"
            description="Assignments, task readiness and deadlines, mentions, replies, approvals, and weekly deadline summaries."
            checked={workflow.state}
            onChange={(value) => updateCategory("workflow", value)}
            disabled={workflow.pending}
          />
          <Toggle
            label="Standup digest emails"
            description="Completed standup summaries. Standup reminders stay in-app and push-only."
            checked={standup.state}
            onChange={(value) => updateCategory("standup", value)}
            disabled={standup.pending}
          />
        </div>
      </CardContent>
    </Card>
  );
}
