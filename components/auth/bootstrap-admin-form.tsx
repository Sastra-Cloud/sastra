"use client";

import { useActionState } from "react";

import { bootstrapAdmin, type BootstrapState } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: BootstrapState = {};

export function BootstrapAdminForm() {
  const [state, formAction, pending] = useActionState(
    bootstrapAdmin,
    initialState
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required autoComplete="name" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {process.env.NODE_ENV === "production" ? (
        <div className="grid gap-2">
          <Label htmlFor="bootstrapToken">Initial setup token</Label>
          <Input
            id="bootstrapToken"
            name="bootstrapToken"
            type="password"
            required
            autoComplete="off"
          />
        </div>
      ) : null}
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create admin account"}
      </Button>
    </form>
  );
}
