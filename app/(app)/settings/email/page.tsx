import { isHostedInstance } from "@/lib/hosted/mode";
import Link from "next/link";
import { Mail } from "lucide-react";
import { count, eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { correspondenceMailboxSettings, emailThreads, gmailAccounts } from "@/lib/db/schema";
import {
  canSendAsCorrespondenceAddress,
  getCorrespondenceAddress,
  getCorrespondenceCaptureSource,
  getMailboxConfig,
} from "@/lib/gmail";
import { SharedMailboxCard, type SharedMailboxState } from "@/components/settings/shared-mailbox-card";
import { emailProviderConfigured, resolveEmailProvider } from "@/lib/email/send";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/format";
import { getWorkspaceSettings } from "@/lib/workspace/queries";
import { buttonVariants } from "@/components/ui/button";
import { isAdminRole } from "@/lib/auth/policy";

export const metadata = { title: "Email" };
export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

export default async function SettingsEmailPage() {
  const { user } = await requireRole("manager");
  const [config, captureSource, address, canSend, [savedMailbox]] = await Promise.all([
    getMailboxConfig(),
    getCorrespondenceCaptureSource(),
    getCorrespondenceAddress(),
    canSendAsCorrespondenceAddress(),
    db
      .select({ mailbox: correspondenceMailboxSettings.mailbox, verifiedAt: correspondenceMailboxSettings.verifiedAt })
      .from(correspondenceMailboxSettings)
      .limit(1),
  ]);
  const enabled = config !== null;
  const captureEnabled = captureSource !== null;
  const captureLabel =
    captureSource === "gmail"
      ? "Gmail"
      : captureSource === "resend"
        ? "Resend"
        : captureSource === "webhook"
          ? "Webhook"
          : "Off";
  const mailbox = config?.mailbox ?? null;
  const provider = resolveEmailProvider(process.env);
  const providerReady = emailProviderConfigured(process.env);
  const providerLabel = provider === "resend" ? "Resend" : "SMTP";

  const [accountRows, threadRows, workspace] = await Promise.all([
    mailbox
      ? db
          .select()
          .from(gmailAccounts)
          .where(eq(gmailAccounts.mailbox, mailbox))
          .limit(1)
      : Promise.resolve([]),
    db.select({ value: count() }).from(emailThreads),
    getWorkspaceSettings(),
  ]);
  const [account] = accountRows;
  const [threads] = threadRows;
  const mailboxState: SharedMailboxState =
    config?.source === "server"
      ? { mode: "server", mailbox: config.mailbox }
      : config?.source === "settings" && savedMailbox
        ? { mode: "connected", mailbox: config.mailbox, checkedLabel: account?.lastSyncedAt ? timeAgo(account.lastSyncedAt) : timeAgo(savedMailbox.verifiedAt) }
        : { mode: "none", needsReconnect: savedMailbox?.mailbox };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" /> Email hub
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={captureEnabled ? "default" : "outline"}>
              {captureEnabled ? "Connected" : "Not configured"}
            </Badge>
          </div>
          <Row label="Correspondence address" value={address ?? "—"} />
          {address && (
            <p className="text-xs text-muted-foreground">
              CC or forward partner and printer email to this address so it
              shows up in Correspondence.
            </p>
          )}
          <Row label="Receiving email through" value={captureLabel} />
          <Row
            label="Sending as this address"
            value={canSend ? (enabled ? "Gmail" : providerLabel) : "Off"}
          />
          <Row
            label="Notification email"
            value={providerReady ? providerLabel : "Not configured"}
          />
          {enabled && (
            <Row
              label="Last sync"
              value={account?.lastSyncedAt ? timeAgo(account.lastSyncedAt) : "never"}
            />
          )}
          <Row label="Captured threads" value={String(threads?.value ?? 0)} />
        </CardContent>
      </Card>

      <SharedMailboxCard state={mailboxState} canEdit={isAdminRole(user)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Outbound email defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground">Default CC recipients</p>
            <p className="mt-1 font-medium">
              {workspace.defaultCcEmails.length
                ? workspace.defaultCcEmails.join(", ")
                : "None configured"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            These recipients are prefilled on every new user-reviewed email.
            Senders can change the list for an individual message.
          </p>
          {isAdminRole(user) ? (
            <Link
              href="/settings/workspace#outbound-email-defaults"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Edit default CC recipients
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              Ask an admin to change the workspace default.
            </p>
          )}
        </CardContent>
      </Card>

      {!captureEnabled && !isHostedInstance() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Other ways to receive email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Server administrators can connect the shared mailbox in the server
              settings instead, with{" "}
              <code className="rounded bg-muted px-1">GMAIL_CAPTURE_MAILBOX</code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1">GMAIL_CAPTURE_APP_PASSWORD</code>.
              Either way, the scheduled{" "}
              <code className="rounded bg-muted px-1">/api/cron/tick</code> task
              checks the mailbox.
            </p>
            <p>
              Without a Gmail mailbox, set{" "}
              <code className="rounded bg-muted px-1">CORRESPONDENCE_ADDRESS</code>{" "}
              to an address your email provider can send as. Sastra then sends
              quote requests, invoices, and replies from it.
            </p>
            <p>
              Mail can also arrive by webhook. Set{" "}
              <code className="rounded bg-muted px-1">RESEND_WEBHOOK_SECRET</code>{" "}
              and point Resend&apos;s receiving webhook at{" "}
              <code className="rounded bg-muted px-1">/api/email/inbound/resend</code>,
              or set{" "}
              <code className="rounded bg-muted px-1">INBOUND_WEBHOOK_SECRET</code>{" "}
              and have your mail relay post each signed message to{" "}
              <code className="rounded bg-muted px-1">/api/email/inbound</code>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
