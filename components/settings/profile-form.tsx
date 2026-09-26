"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateProfile, type TeamState } from "@/lib/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError, FieldErrorsContext } from "./field-errors";
import { TimezoneControl } from "./timezone-control";
import { Label } from "@/components/ui/label";

export function ProfileForm({
  defaultName,
  defaultTimezone,
}: {
  defaultName: string;
  defaultTimezone: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: TeamState, data: FormData): Promise<TeamState> => {
    try { return await updateProfile(previous, data); }
    catch { return { error: "Could not save your profile. Your changes are still here; try again." }; }
  }, {} as TeamState);


  useEffect(() => {
    if (state.ok) {
      toast.success("Profile updated");
      router.refresh();
    }
  }, [state, router]);

  return (
    <FieldErrorsContext.Provider value={state.fieldErrors ?? {}}>
    <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); startTransition(() => action(data)); }} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input aria-invalid={!!state.fieldErrors?.name} aria-describedby="name-error" id="name" name="name" defaultValue={defaultName} required /><FieldError name="name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="timezone">Timezone</Label>
        <TimezoneControl id="timezone" defaultValue={defaultTimezone} /><FieldError name="timezone" />
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
    </FieldErrorsContext.Provider>
  );
}
