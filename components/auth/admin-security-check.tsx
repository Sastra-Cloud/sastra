"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, KeyRound, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import {
  requestAdminSecurityCode,
  verifyAdminSecurityCode,
  type AssuranceState,
} from "@/lib/auth/assurance-actions";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AssuranceState = {};

export function AdminSecurityCheck({
  email,
  hasPasskey,
  next,
}: {
  email: string;
  hasPasskey: boolean;
  next: string;
}) {
  const router = useRouter();
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [sendState, sendAction, sending] = useActionState(
    requestAdminSecurityCode,
    initialState
  );
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyAdminSecurityCode,
    initialState
  );
  const challengeId =
    verifyState.challengeId ?? sendState.challengeId ?? undefined;
  const codeSent = Boolean(challengeId);

  async function verifyWithPasskey() {
    setPasskeyPending(true);
    const { error } = await authClient.signIn.passkey();
    setPasskeyPending(false);
    if (error) {
      toast.error(error.message || "The passkey check did not finish.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border bg-muted/25 p-4">
        <div className="flex gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">One check, then 60 quiet days</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This browser will stay trusted for protected finance and security
              work. You can revoke trusted browsers at any time.
            </p>
          </div>
        </div>
      </div>

      {hasPasskey ? (
        <Button
          type="button"
          size="lg"
          disabled={passkeyPending || sending || verifying}
          onClick={verifyWithPasskey}
        >
          {passkeyPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Fingerprint className="size-4" />
          )}
          {passkeyPending ? "Checking passkey…" : "Use fingerprint or passkey"}
        </Button>
      ) : null}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">
            {hasPasskey ? "or use email" : "Verify by email"}
          </span>
        </div>
      </div>

      {codeSent ? (
        <form action={verifyAction} className="grid gap-3">
          <input type="hidden" name="challengeId" value={challengeId} />
          <input type="hidden" name="next" value={next} />
          <div className="grid gap-2">
            <Label htmlFor="security-code">Six-digit code</Label>
            <Input
              id="security-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="text-center text-lg tracking-[0.35em]"
            />
            <p className="text-xs text-muted-foreground">
              Sent to {email}. It expires in 10 minutes.
            </p>
          </div>
          {verifyState.error ? (
            <p className="text-sm text-destructive">{verifyState.error}</p>
          ) : null}
          <Button type="submit" disabled={verifying || passkeyPending}>
            {verifying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            {verifying ? "Verifying…" : "Verify code"}
          </Button>
          <Button
            type="submit"
            formAction={sendAction}
            variant="ghost"
            disabled={sending || verifying}
          >
            {sending ? "Sending…" : "Send a new code"}
          </Button>
        </form>
      ) : (
        <form action={sendAction}>
          {sendState.error ? (
            <p className="mb-3 text-sm text-destructive">{sendState.error}</p>
          ) : null}
          <Button
            type="submit"
            variant={hasPasskey ? "outline" : "default"}
            size="lg"
            className="w-full"
            disabled={sending || passkeyPending}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Mail className="size-4" />
            )}
            {sending ? "Sending code…" : `Email a code to ${email}`}
          </Button>
        </form>
      )}
    </div>
  );
}
