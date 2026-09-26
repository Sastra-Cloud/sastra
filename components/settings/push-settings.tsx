"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing } from "lucide-react";

import { updatePushSchedule } from "@/lib/notifications/actions";
import { EnablePushFlow } from "@/components/pwa/enable-push-flow";
import { PushDevices, type PushDevice } from "@/components/settings/push-devices";
import { TestPushButton } from "@/components/settings/test-push-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";

type Mode = "off" | "quiet" | "work";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-xs";

function minutesToHHMM(m: number) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function hhmmToMinutes(s: string) {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toLocalInput(d: Date | null) {
  if (!d) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

const MODE_HINT: Record<Mode, string> = {
  off: "Push can arrive any time of day (in-app and email are unaffected).",
  quiet: "Push is held during this window each day, in your profile timezone.",
  work: "Push is only sent during your work hours, in your profile timezone.",
};

export function PushSettings({
  schedule,
  devices,
}: {
  schedule: {
    mode: Mode;
    quietHoursStart: number;
    quietHoursEnd: number;
    workHoursStart: number;
    workHoursEnd: number;
    pushOnlyWhenActive: boolean;
    pushReviewSuggestions: boolean;
    pushPausedUntil: string | null; // ISO
  };
  devices: PushDevice[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Schedule form state.
  const [mode, setMode] = useState<Mode>(schedule.mode);
  const [qhStart, setQhStart] = useState(minutesToHHMM(schedule.quietHoursStart));
  const [qhEnd, setQhEnd] = useState(minutesToHHMM(schedule.quietHoursEnd));
  const [whStart, setWhStart] = useState(minutesToHHMM(schedule.workHoursStart));
  const [whEnd, setWhEnd] = useState(minutesToHHMM(schedule.workHoursEnd));
  const [onlyActive, setOnlyActive] = useState(schedule.pushOnlyWhenActive);
  const [reviewSuggestions, setReviewSuggestions] = useState(
    schedule.pushReviewSuggestions
  );
  const [pausedUntil, setPausedUntil] = useState(
    toLocalInput(schedule.pushPausedUntil ? new Date(schedule.pushPausedUntil) : null)
  );

  function saveSchedule() {
    start(async () => {
      await updatePushSchedule({
        mode,
        quietHoursStart: hhmmToMinutes(qhStart),
        quietHoursEnd: hhmmToMinutes(qhEnd),
        workHoursStart: hhmmToMinutes(whStart),
        workHoursEnd: hhmmToMinutes(whEnd),
        pushOnlyWhenActive: onlyActive,
        pushReviewSuggestions: reviewSuggestions,
        pushPausedUntil: pausedUntil ? new Date(pausedUntil).toISOString() : null,
      });
      toast.success("Notification schedule saved");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-5 py-4">
        <div className="space-y-3">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <BellRing className="size-4" />
              Push notifications
            </p>
            <p className="text-sm text-muted-foreground">
              Get notified on this device even when the app is closed.
            </p>
          </div>
          <EnablePushFlow variant="settings" />
          {devices.length > 0 ? (
            <div className="space-y-3 border-t pt-4">
              <PushDevices devices={devices} />
              <TestPushButton />
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t pt-4">
          <Label className="text-sm font-medium">What to send</Label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={reviewSuggestions}
              onChange={(e) => setReviewSuggestions(e.target.checked)}
            />
            <span>
              Correspondence review suggestions
              <span className="block text-xs text-muted-foreground">
                Possible projects, counterparties, and grant reminders stay on
                Home and in the app when this is off.
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="grid gap-1">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              When to send push
              <HelpTip label="About the push schedule">
                Controls when push notifications can arrive, in your profile
                timezone. In-app and email are unaffected.
              </HelpTip>
            </Label>
            <select
              className={selectClass}
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="off">Always (no schedule)</option>
              <option value="quiet">Quiet hours — silence a window</option>
              <option value="work">Only during work hours</option>
            </select>
          </div>

          {mode === "quiet" ? (
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Quiet from</Label>
                <Input
                  type="time"
                  value={qhStart}
                  onChange={(e) => setQhStart(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Quiet to</Label>
                <Input
                  type="time"
                  value={qhEnd}
                  onChange={(e) => setQhEnd(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {mode === "work" ? (
            <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Work starts</Label>
                <Input
                  type="time"
                  value={whStart}
                  onChange={(e) => setWhStart(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Work ends</Label>
                <Input
                  type="time"
                  value={whEnd}
                  onChange={(e) => setWhEnd(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{MODE_HINT[mode]}</p>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
            />
            Only send push while I&apos;m active in the app
            <HelpTip label="About active-only push">
              Holds push while you&apos;re marked away or offline, and resumes when
              you&apos;re active again.
            </HelpTip>
          </label>

          <div className="grid gap-1 sm:max-w-xs">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Pause push until (out of office)
              <HelpTip label="About pausing">
                Silences all push until this time — handy for time off. Clear it to
                resume.
              </HelpTip>
            </Label>
            <Input
              type="datetime-local"
              value={pausedUntil}
              onChange={(e) => setPausedUntil(e.target.value)}
            />
          </div>

          <Button size="sm" onClick={saveSchedule} disabled={pending}>
            {pending ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
