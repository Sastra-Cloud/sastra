"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateProfile, type TeamState } from "@/lib/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ZONES = [
  "Asia/Phnom_Penh",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Yangon",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
];

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function ProfileForm({
  defaultName,
  defaultTimezone,
}: {
  defaultName: string;
  defaultTimezone: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(updateProfile, {} as TeamState);
  const zones = ZONES.includes(defaultTimezone)
    ? ZONES
    : [defaultTimezone, ...ZONES];

  useEffect(() => {
    if (state.ok) {
      toast.success("Profile updated");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={action} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          className={selectClass}
          defaultValue={defaultTimezone}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Used for standups, notification digests, and due-date displays.
        </p>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
