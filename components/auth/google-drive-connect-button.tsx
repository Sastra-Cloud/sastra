"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

/** Linking again requests consent without first deleting the existing account. */
export function GoogleDriveConnectButton({ connected = false }: { connected?: boolean }) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function connect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(false);
    try {
      const callback = new URL(window.location.href);
      if (callback.pathname === "/settings/profile") {
        for (const key of ["drive", "error", "error_description"]) callback.searchParams.delete(key);
      }
      const result = await authClient.linkSocial({
        provider: "google",
        scopes: ["https://www.googleapis.com/auth/drive.file"],
        callbackURL: callback.href,
        errorCallbackURL: `${window.location.origin}/settings/profile?drive=error#google-drive`,
        // Ask which Google account to use, then renew consent and offline access.
        additionalParams: { prompt: "select_account consent", access_type: "offline" },
        fetchOptions: { timeout: 15_000 },
      });
      if (result.error || !result.data?.url) throw new Error("Google authorization could not start");
      // Better Auth redirects to Google. Stay pending until navigation completes.
    } catch {
      inFlight.current = false;
      setPending(false);
      setError(true);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button type="button" variant="outline" size="sm" disabled={pending} aria-busy={pending} onClick={connect}>
        {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
        {pending ? "Opening Google…" : connected ? "Reconnect Google Drive" : "Connect Google Drive"}
      </Button>
      {error ? <p role="alert" className="text-sm text-destructive">Couldn't connect to Google. Check your internet and try again.</p> : null}
    </div>
  );
}
