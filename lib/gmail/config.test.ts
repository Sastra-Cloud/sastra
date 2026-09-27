import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { normalizeAppPassword, providedCorrespondenceAddress, resolveCorrespondenceAddress, serverMailboxConfig } from "./config";

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

describe("correspondence address", () => {
  const provided = providedCorrespondenceAddress({ CORRESPONDENCE_ADDRESS: " Hope@In.Sastra.Cloud " });
  it("uses the provided address until an admin connects a mailbox in Settings", () => {
    expect(provided).toBe("hope@in.sastra.cloud");
    expect(resolveCorrespondenceAddress(null, provided)).toBe("hope@in.sastra.cloud");
    expect(resolveCorrespondenceAddress({ mailbox: "pub@example.org", source: "settings" }, provided)).toBe("pub@example.org");
  });
  it("keeps a server's own address ahead of a mailbox from the server settings", () => {
    expect(resolveCorrespondenceAddress({ mailbox: "pub@example.org", source: "server" }, provided)).toBe("hope@in.sastra.cloud");
    expect(resolveCorrespondenceAddress({ mailbox: "pub@example.org", source: "server" }, null)).toBe("pub@example.org");
    expect(resolveCorrespondenceAddress(null, providedCorrespondenceAddress({}))).toBeNull();
  });
});
