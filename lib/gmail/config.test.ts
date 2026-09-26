import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { normalizeAppPassword, serverMailboxConfig } from "./config";

describe("shared mailbox config", () => {
  it("uses server settings when both are set, with Gmail's default hosts", () => {
    expect(serverMailboxConfig({ GMAIL_CAPTURE_MAILBOX: " Pub@Example.org ", GMAIL_CAPTURE_APP_PASSWORD: "abcd efgh ijkl mnop" })).toEqual({
      mailbox: "pub@example.org", appPassword: "abcdefghijklmnop", imapHost: "imap.gmail.com", imapPort: 993, smtpHost: "smtp.gmail.com", smtpPort: 465, source: "server",
    });
  });
  it("leaves the mailbox to Settings when the server does not set one", () => {
    expect(serverMailboxConfig({ GMAIL_CAPTURE_MAILBOX: "pub@example.org" })).toBeNull();
    expect(serverMailboxConfig({})).toBeNull();
    expect(normalizeAppPassword("  ")).toBeNull();
  });
});
