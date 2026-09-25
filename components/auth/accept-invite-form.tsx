"use client";

import { useActionState } from "react";

import { acceptInvite, type AcceptState } from "@/lib/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AcceptState = {};

export function AcceptInviteForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, action, pending] = useActionState(acceptInvite, initial);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required autoFocus autoComplete="name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Choose a password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
