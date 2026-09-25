"use client";

import { useActionState } from "react";

import { createStandup, type StandupState } from "@/lib/standup/config-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function StandupCreateForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [state, action, pending] = useActionState(
    createStandup,
    {} as StandupState
  );
  return (
    <Card>
      <CardContent className="py-4">
        <form action={action} className="space-y-3">
          <p className="text-sm font-medium">New standup</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1 sm:col-span-2">
              <Label>Name</Label>
              <Input name="name" placeholder="Daily Stand Up" required />
            </div>
            <div className="grid gap-1">
              <Label>Time</Label>
              <Input name="scheduleTime" type="time" defaultValue="09:00" />
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
            <Label>Timezone</Label>
            <select name="timezone" className={selectClass} defaultValue={defaultTimezone}>
              {![
                "Asia/Phnom_Penh",
                "Asia/Bangkok",
                "Asia/Ho_Chi_Minh",
                "UTC",
              ].includes(defaultTimezone) ? <option>{defaultTimezone}</option> : null}
              <option>Asia/Phnom_Penh</option>
              <option>Asia/Bangkok</option>
              <option>Asia/Ho_Chi_Minh</option>
              <option>UTC</option>
            </select>
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
