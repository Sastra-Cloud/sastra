import "server-only";

import { imapClientFor } from "./imap";
import { smtpTransportFor } from "./send";
import type { MailboxConfig } from "./config";

export type MailboxCheck =
  | { ok: true; uidValidity: string; lastUid: number }
  | { ok: false; reason: "auth" | "network" | "other" };

/** Sort a Gmail connection error into something an admin can act on. */
export function classifyMailboxError(error: unknown): "auth" | "network" | "other" {
  const e = error as { authenticationFailed?: boolean; code?: string; responseCode?: number; message?: string } | null;
  const text = `${e?.code ?? ""} ${e?.responseCode ?? ""} ${e?.message ?? ""}`;
  if (e?.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|Username and Password not accepted|\b53[45]\b|EAUTH/i.test(text)) return "auth";
  if (/ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|timed? ?out|ESOCKET|ECONNECTION/i.test(text)) return "network";
  return "other";
}

/**
 * Sign in to the mailbox over IMAP and SMTP without reading or sending mail,
 * and note where its inbox ends now, so capture starts with new email only.
 */
export async function checkMailboxLogin(config: Pick<MailboxConfig, "mailbox" | "appPassword" | "imapHost" | "imapPort" | "smtpHost" | "smtpPort">): Promise<MailboxCheck> {
  const imap = imapClientFor(config);
  let uidValidity = "0";
  let lastUid = 0;
  try {
    await imap.connect();
    const status = await imap.status("INBOX", { uidNext: true, uidValidity: true });
    uidValidity = String(status.uidValidity ?? "0");
    lastUid = Math.max(0, Number(status.uidNext ?? 1) - 1);
    await imap.logout();
  } catch (error) {
    imap.close();
    return { ok: false, reason: classifyMailboxError(error) };
  }
  const smtp = smtpTransportFor(config);
  try {
    await smtp.verify();
  } catch (error) {
    return { ok: false, reason: classifyMailboxError(error) };
  } finally {
    smtp.close();
  }
  return { ok: true, uidValidity, lastUid };
}
