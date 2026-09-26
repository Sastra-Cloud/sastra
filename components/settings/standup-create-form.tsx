"use client";

import { startTransition, useActionState } from "react";

import { createStandup, type StandupState } from "@/lib/standup/config-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TimezoneControl } from "./timezone-control";
import { Label } from "@/components/ui/label";

const DAYS = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];

export function StandupCreateForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [state, action, pending] = useActionState(
    async (previous: StandupState, data: FormData): Promise<StandupState> => {
      try { return await createStandup(previous, data); }
      catch (error) {
        if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
        return { error: "Could not create the check-in. Your settings are still here; try again." };
      }
    },
    {} as StandupState
  );
  return (
    <Card>
      <CardContent className="py-4">
        <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); }} className="space-y-3">
          <p className="text-sm font-medium">New standup</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1 sm:col-span-2">
              <Label htmlFor="standupName">Name</Label>
              <Input id="standupName" name="name" placeholder="Daily Stand Up" required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="scheduleTime">Time</Label>
              <Input id="scheduleTime" name="scheduleTime" type="time" defaultValue="09:00" />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Days</Label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d.v} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    name="days"
                    value={d.v}
                    defaultChecked={d.v >= 1 && d.v <= 5}
                  />
                  {d.l}
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="timezone">Timezone</Label>
            <TimezoneControl id="timezone" defaultValue={defaultTimezone} />
          </div>
          {state.error ? (
            <p className="text-sm text-destructive">{state.error}</p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create standup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
