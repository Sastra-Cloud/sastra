import { isHostedInstance, hostedAccountUrl } from "@/lib/hosted/mode";
import Link from "next/link";
import { Mail } from "lucide-react";
import { count, eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailThreads, gmailAccounts } from "@/lib/db/schema";
import {
  captureMailbox,
  correspondenceAddress,
  correspondenceCaptureSource,
  correspondenceSendEnabled,
  gmailEnabled,
} from "@/lib/gmail";
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
  const enabled = gmailEnabled();
  const captureSource = correspondenceCaptureSource();
  const captureEnabled = captureSource !== null;
  const captureLabel =
    captureSource === "gmail"
      ? "Gmail"
      : captureSource === "resend"
        ? "Resend"
        : captureSource === "webhook"
          ? "Webhook"
          : "Off";
  const mailbox = captureMailbox();
  const address = correspondenceAddress();
  const canSend = correspondenceSendEnabled();
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

      {!captureEnabled && isHostedInstance() ? <Card><CardHeader><CardTitle>Email setup</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p>Contact Sastra Cloud support to connect your team email. You can keep managing projects and recording publishing details manually.</p>{hostedAccountUrl() ? <a href={hostedAccountUrl()!} className="text-primary underline">Manage account</a> : null}</CardContent></Card> : null}
      {!captureEnabled && !isHostedInstance() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect it</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              The email hub captures rights/MoU email from a shared mailbox and
              lets the assistant draft replies. To turn it on:
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                On the shared mailbox account, turn on 2-Step Verification and
                create an{" "}
                <span className="font-medium text-foreground">app password</span>.
              </li>
              <li>
                Set <code className="rounded bg-muted px-1">GMAIL_CAPTURE_MAILBOX</code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1">
                  GMAIL_CAPTURE_APP_PASSWORD
                </code>{" "}
                in the server environment.
              </li>
              <li>Enable IMAP in that mailbox’s Gmail settings.</li>
              <li>
                Make sure the scheduled{" "}
                <code className="rounded bg-muted px-1">/api/cron/tick</code>{" "}
                task is running; it polls the mailbox for you.
              </li>
            </ol>
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
