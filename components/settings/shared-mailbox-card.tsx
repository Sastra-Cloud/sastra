"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmDialog } from "@/lib/dialog-requests";
import { connectCorrespondenceMailbox, removeCorrespondenceMailbox } from "@/lib/email/mailbox-actions";

export type SharedMailboxState =
  | { mode: "server"; mailbox: string }
  | { mode: "connected"; mailbox: string; checkedLabel: string }
  | { mode: "none"; needsReconnect?: string };

const APP_PASSWORDS_URL = "https://myaccount.google.com/apppasswords";

/**
 * Settings ▸ Email: connect the shared Gmail mailbox that Correspondence reads.
 * Connecting is progress-based (Sastra signs in to Gmail first); disconnecting
 * is confirmed, then removed from view at once and restored if it fails.
 */
export function SharedMailboxCard({ state: initial, canEdit }: { state: SharedMailboxState; canEdit: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [editing, setEditing] = useState(initial.mode === "none");
  const [mailbox, setMailbox] = useState(initial.mode === "connected" ? initial.mailbox : initial.mode === "none" ? initial.needsReconnect ?? "" : "");
  const [appPassword, setAppPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  const connect = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await connectCorrespondenceMailbox({ mailbox, appPassword });
        if (!result.ok) {
          setError(result.error.message);
          setFieldErrors(result.error.fieldErrors ?? {});
          return;
        }
        setAppPassword("");
        setEditing(false);
        setState({ mode: "connected", mailbox: result.data?.mailbox ?? mailbox, checkedLabel: "just now" });
        toast.success("Mailbox connected. New email will show in Correspondence within a few minutes.");
        router.refresh();
      } catch {
        setError("Couldn't connect. Check your internet and try again.");
      }
    });
  };

  const disconnect = async () => {
    if (state.mode !== "connected") return;
    const previous = state;
    if (!(await confirmDialog(`Disconnect ${previous.mailbox}? Sastra stops reading this mailbox. Email already in Correspondence stays.`))) return;
    setState({ mode: "none" });
    setEditing(true);
    startTransition(async () => {
      try {
        const result = await removeCorrespondenceMailbox();
        if (!result.ok) throw new Error(result.error.message);
        router.refresh();
      } catch (e) {
        setState(previous);
        setEditing(false);
        toast.error(e instanceof Error && e.message ? e.message : "Couldn't disconnect. Try again.");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" /> Shared mailbox
        </CardTitle>
        <CardDescription>
          Connect one Gmail or Google Workspace mailbox. Sastra reads new email in its inbox and shows it in
          Correspondence. Replies you send from Sastra come from this address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {state.mode === "server" ? (
          <p>
            <span className="font-medium">{state.mailbox}</span> is connected by your server settings. To change it,
            update the server settings.
          </p>
        ) : null}

        {state.mode === "connected" && !editing ? (
          <div className="space-y-3">
            <p>
              Connected: <span className="font-medium">{state.mailbox}</span>
              <span className="text-muted-foreground"> · checked {state.checkedLabel}</span>
            </p>
            <p className="text-muted-foreground">
              Sastra checks this inbox every few minutes during work hours, and every hour at other times.
            </p>
            {canEdit ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} disabled={pending}>
                  Change mailbox
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={disconnect} disabled={pending}>
                  Disconnect
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {state.mode !== "server" && editing && !canEdit ? (
          <p className="text-muted-foreground">No mailbox is connected. Ask an admin to connect one.</p>
        ) : null}

        {state.mode !== "server" && editing && canEdit ? (
          <form className="space-y-4" onSubmit={connect} noValidate>
            {state.mode === "none" && state.needsReconnect ? (
              <p className="text-warning-text" role="status">
                Connect {state.needsReconnect} again. Sastra can no longer read its saved app password.
              </p>
            ) : null}
            <p className="text-muted-foreground">
              Use a mailbox just for Sastra, such as publishing@yourministry.org. Sastra reads every new email that
              arrives in its inbox, starting now. Older email stays in Gmail.
            </p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Sign in to that Google account and turn on 2-Step Verification.</li>
              <li>
                Create an app password named Sastra at{" "}
                <a className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4" href={APP_PASSWORDS_URL} target="_blank" rel="noreferrer">
                  myaccount.google.com/apppasswords <ExternalLink className="size-3" aria-hidden />
                </a>
                .
              </li>
              <li>Enter the email address and the app password here.</li>
            </ol>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shared-mailbox-address">Email address</Label>
                <Input
                  id="shared-mailbox-address"
                  type="email"
                  autoComplete="off"
                  value={mailbox}
                  onChange={(e) => setMailbox(e.target.value)}
                  placeholder="publishing@yourministry.org"
                  aria-invalid={fieldErrors.mailbox ? true : undefined}
                  aria-describedby={fieldErrors.mailbox ? "shared-mailbox-address-error" : undefined}
                  disabled={pending}
                  required
                />
                {fieldErrors.mailbox ? <p id="shared-mailbox-address-error" className="text-xs text-destructive">{fieldErrors.mailbox[0]}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shared-mailbox-password">App password</Label>
                <Input
                  id="shared-mailbox-password"
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="16 letters"
                  aria-invalid={fieldErrors.appPassword ? true : undefined}
                  aria-describedby={fieldErrors.appPassword ? "shared-mailbox-password-error" : undefined}
                  disabled={pending}
                  required
                />
                {fieldErrors.appPassword ? <p id="shared-mailbox-password-error" className="text-xs text-destructive">{fieldErrors.appPassword[0]}</p> : null}
              </div>
            </div>
            {error && !fieldErrors.mailbox && !fieldErrors.appPassword ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {pending ? "Checking with Gmail…" : "Test and connect"}
              </Button>
              {state.mode === "connected" ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setError(null); setFieldErrors({}); setAppPassword(""); }} disabled={pending}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
