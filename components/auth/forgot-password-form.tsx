"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;

    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email: normalizedEmail,
      redirectTo: "/reset-password",
    });
    setPending(false);

    if (error) {
      toast.error(
        "Couldn’t send the reset link. Check your internet and try again."
      );
      return;
    }

    setSentTo(normalizedEmail);
  }

  if (sentTo) {
    return (
      <div className="grid gap-4" aria-live="polite">
        <div className="rounded-xl border bg-muted/40 p-4">
          <div className="flex gap-3">
            <MailCheck
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                If an account uses{" "}
                <span className="break-all text-foreground">{sentTo}</span>, we
                sent a reset link. The link expires in one hour.
              </p>
            </div>
          </div>
        </div>
        <Link href="/login" className={buttonVariants({ className: "w-full" })}>
          Back to sign in
        </Link>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => setSentTo(null)}
        >
          Try another email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={requestReset} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoFocus
          required
          spellCheck={false}
          disabled={pending}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending link…" : "Send reset link"}
      </Button>
      <Link
        href="/login"
        className={buttonVariants({
          variant: "outline",
          className: "w-full",
        })}
      >
        Back to sign in
      </Link>
    </form>
  );
}
