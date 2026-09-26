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
  const [passwordPending, setPasswordPending] = React.useState(false);
  const [linkPending, setLinkPending] = React.useState(false);
  const [passkeyPending, setPasskeyPending] = React.useState(false);
  const [linkSent, setLinkSent] = React.useState(false);

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (passwordPending) return;
    setPasswordPending(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) { toast.error(error.message || "Check your email and password."); return; }
      router.push(redirectTo); router.refresh();
    } catch { toast.error("Could not sign in. Check your connection and try again."); }
    finally { setPasswordPending(false); }
  }
  async function onMagicLink() {
    if (linkPending) return;
    if (!email) { toast.error("Enter your email first."); return; }
    setLinkPending(true);
    try {
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: redirectTo });
      if (error) { toast.error(error.message || "Could not send the link."); return; }
      setLinkSent(true);
    } catch { toast.error("Could not send the link. Check your connection and try again."); }
    finally { setLinkPending(false); }
  }
  async function onPasskeySignIn() {
    if (passkeyPending) return;
    setPasskeyPending(true);
    try {
      const { error } = await authClient.signIn.passkey();
      if (error) { toast.error(error.message || "Could not sign in with a passkey."); return; }
      router.push(redirectTo); router.refresh();
    } catch { toast.error("Could not sign in with a passkey. Try again."); }
    finally { setPasskeyPending(false); }
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
      <Button type="submit" disabled={passwordPending} className="w-full">
        {passwordPending ? "Signing in…" : "Sign in"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={linkPending}
        onClick={onMagicLink}
        className="w-full"
      >
        {linkPending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={passkeyPending}
        onClick={onPasskeySignIn}
        className="w-full"
      >
        <Fingerprint className="size-4" />
        {passkeyPending ? "Checking passkey…" : "Sign in with a passkey"}
      </Button>
      {linkSent ? <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">Check your email for a sign-in link. You can keep this page open.</p> : null}
    </form>
  );
}
