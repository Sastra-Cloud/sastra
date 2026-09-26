"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { sealSecret, secretBoxConfigured } from "@/lib/crypto/secret-box";
import { db } from "@/lib/db";
import { correspondenceMailboxSettings, gmailAccounts } from "@/lib/db/schema";
import { mailboxManagedByServer, normalizeAppPassword } from "@/lib/gmail/config";
import { checkMailboxLogin } from "@/lib/gmail/verify";
import { requestScheduledTick } from "@/lib/hosted/tick-request";

import { validateMailboxInput } from "./mailbox-input";

const GMAIL_HOSTS = { imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465 };

/**
 * Connect the correspondence mailbox (admin). Signs in to Gmail first and only
 * saves when that works; the app password is stored sealed. Capture starts
 * with email that arrives from now on.
 */
export async function connectCorrespondenceMailbox(input: { mailbox: string; appPassword: string }): Promise<ActionResult<{ mailbox: string }>> {
  const { user } = await requireRole("admin");
  if (mailboxManagedByServer()) {
    return { ok: false, error: { message: "Your server settings connect this mailbox. Change it there." } };
  }
  const valid = validateMailboxInput(input);
  if (!valid.ok) return { ok: false, error: { message: valid.message, fieldErrors: valid.fieldErrors } };
  if (!secretBoxConfigured()) {
    return { ok: false, error: { message: "Sastra cannot store the password safely yet. Ask whoever runs your server to set APP_ENCRYPTION_KEY." } };
  }

  const appPassword = normalizeAppPassword(input.appPassword)!;
  const check = await checkMailboxLogin({ mailbox: valid.mailbox, appPassword, ...GMAIL_HOSTS });
  if (!check.ok) {
    const message =
      check.reason === "auth"
        ? "Gmail did not accept this address and app password. Check the address, then copy the app password again."
        : check.reason === "network"
          ? "Sastra could not reach Gmail. Try again in a minute."
          : "Gmail did not let Sastra sign in. Check that 2-Step Verification is on and the app password is new, then try again.";
    return { ok: false, error: { message } };
  }

  const now = new Date();
  const values = { mailbox: valid.mailbox, appPasswordSealed: sealSecret(appPassword), verifiedAt: now, updatedBy: user.id, updatedAt: now };
  await db.transaction(async (tx) => {
    await tx.insert(correspondenceMailboxSettings).values({ id: "workspace", ...values }).onConflictDoUpdate({ target: correspondenceMailboxSettings.id, set: values });
    // Start with new email; a mailbox connected before keeps its place.
    await tx
      .insert(gmailAccounts)
      .values({ mailbox: valid.mailbox, connectionType: "imap", historyId: `${check.uidValidity}:${check.lastUid}` })
      .onConflictDoNothing({ target: gmailAccounts.mailbox });
  });
  requestScheduledTick(); // Sastra Cloud: start checking the mailbox soon
  revalidatePath("/settings/email");
  revalidatePath("/correspondence");
  return { ok: true, data: { mailbox: valid.mailbox } };
}

/** Disconnect the mailbox (admin, after confirmation). Captured email stays. */
export async function removeCorrespondenceMailbox(): Promise<ActionResult> {
  await requireRole("admin");
  if (mailboxManagedByServer()) {
    return { ok: false, error: { message: "Your server settings connect this mailbox. Change it there." } };
  }
  await db.delete(correspondenceMailboxSettings);
  revalidatePath("/settings/email");
  revalidatePath("/correspondence");
  return { ok: true };
}
