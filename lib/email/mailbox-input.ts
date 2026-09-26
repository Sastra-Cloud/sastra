/** Pure checks for the mailbox form, shared by the action and its tests. */
export type MailboxInputCheck =
  | { ok: true; mailbox: string }
  | { ok: false; message: string; fieldErrors: Record<string, string[]> };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateMailboxInput(input: { mailbox?: unknown; appPassword?: unknown }): MailboxInputCheck {
  const mailbox = typeof input.mailbox === "string" ? input.mailbox.trim().toLowerCase() : "";
  const password = typeof input.appPassword === "string" ? input.appPassword.replace(/\s+/g, "") : "";
  if (!EMAIL.test(mailbox)) {
    return { ok: false, message: "Enter the mailbox's full email address.", fieldErrors: { mailbox: ["Enter the full email address, like publishing@yourministry.org."] } };
  }
  if (!/^[a-z]{16}$/i.test(password)) {
    return { ok: false, message: "An app password is 16 letters.", fieldErrors: { appPassword: ["An app password is 16 letters. Copy it again from your Google account."] } };
  }
  return { ok: true, mailbox };
}
