"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheck, Link2Off } from "lucide-react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth/client";
import {
  getNewPasswordError,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-reset";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function InvalidResetLink() {
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-muted/40 p-4" role="alert">
        <div className="flex gap-3">
          <Link2Off
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            This reset link is invalid or has expired. Request a new link to
            continue.
          </p>
        </div>
      </div>
      <Link
        href="/forgot-password"
        className={buttonVariants({ className: "w-full" })}
      >
        Request new link
      </Link>
      <Link
        href="/login"
        className={buttonVariants({
          variant: "outline",
          className: "w-full",
        })}
      >
        Back to sign in
      </Link>
    </div>
  );
}

export function ResetPasswordForm({
  token,
  invalid = false,
}: {
  token?: string;
  invalid?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(invalid || !token);
  const [validationError, setValidationError] = useState<string | null>(null);

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = getNewPasswordError(password, confirmation);
    setValidationError(nextError);
    if (nextError || !token) return;

    setPending(true);
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token,
    });
    setPending(false);

    if (error) {
      if (error.code === "INVALID_TOKEN") {
        setLinkInvalid(true);
        return;
      }
      toast.error(
        "Couldn’t reset your password. Check your internet and try again."
      );
      return;
    }

    setPassword("");
    setConfirmation("");
    setCompleted(true);
  }

  if (linkInvalid) {
    return <InvalidResetLink />;
  }

  if (completed) {
    return (
      <div className="grid gap-4" aria-live="polite">
        <div className="rounded-xl border bg-muted/40 p-4">
          <div className="flex gap-3">
            <CircleCheck
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="font-medium">Password reset</p>
              <p className="text-sm text-muted-foreground">
                Your new password is ready. Sign in again on each device.
              </p>
            </div>
          </div>
        </div>
        <Link href="/login" className={buttonVariants({ className: "w-full" })}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={resetPassword} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={pending}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setValidationError(null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Use at least {PASSWORD_MIN_LENGTH} characters.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          disabled={pending}
          aria-invalid={validationError ? true : undefined}
          aria-describedby={
            validationError ? "reset-password-error" : undefined
          }
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            setValidationError(null);
          }}
        />
      </div>
      {validationError ? (
        <p
          id="reset-password-error"
          className="text-sm text-destructive"
          role="alert"
        >
          {validationError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Resetting password…" : "Reset password"}
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
