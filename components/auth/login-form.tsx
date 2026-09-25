"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Fingerprint } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      toast.error(error.message || "Invalid email or password.");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  async function onMagicLink() {
    if (!email) {
      toast.error("Enter your email first.");
      return;
    }
    setPending(true);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: redirectTo,
    });
    setPending(false);
    if (error) {
      toast.error(error.message || "Could not send the link.");
      return;
    }
    toast.success("Check your email for a sign-in link.");
  }

  async function onPasskeySignIn() {
    setPending(true);
    const { error } = await authClient.signIn.passkey();
    setPending(false);
    if (error) {
      toast.error(error.message || "Could not sign in with a passkey.");
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={onPasswordSignIn} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onMagicLink}
        className="w-full"
      >
        Email me a magic link
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onPasskeySignIn}
        className="w-full"
      >
        <Fingerprint className="size-4" />
        Sign in with a passkey
      </Button>
    </form>
  );
}
