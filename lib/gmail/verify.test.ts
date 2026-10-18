import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./imap", () => ({ imapClientFor: vi.fn() }));
vi.mock("./send", () => ({ smtpTransportFor: vi.fn() }));

import { imapClientFor } from "./imap";
import { smtpTransportFor } from "./send";
import { checkMailboxLogin, classifyMailboxError } from "./verify";

describe("Gmail connection errors", () => {
  it("separates a wrong password from a network problem", () => {
    expect(classifyMailboxError({ authenticationFailed: true })).toBe("auth");
    expect(classifyMailboxError({ responseCode: 535, message: "5.7.8 Username and Password not accepted" })).toBe("auth");
    expect(classifyMailboxError({ code: "ETIMEDOUT" })).toBe("network");
    expect(classifyMailboxError(new Error("something odd"))).toBe("other");
  });
});

describe("mailbox login verification", () => {
  const config = {
    mailbox: "capture@example.org",
    appPassword: "test-only",
    imapHost: "imap.example.org",
    imapPort: 993,
    smtpHost: "smtp.example.org",
    smtpPort: 465,
  };
  const imap = {
    connect: vi.fn(),
    status: vi.fn(),
    logout: vi.fn(),
    close: vi.fn(),
  };
  const smtp = { verify: vi.fn(), close: vi.fn() };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(imapClientFor).mockReturnValue(imap as unknown as ReturnType<typeof imapClientFor>);
    vi.mocked(smtpTransportFor).mockReturnValue(smtp as unknown as ReturnType<typeof smtpTransportFor>);
    imap.status.mockResolvedValue({ uidValidity: BigInt(123), uidNext: 9 });
  });

  it("records the inbox cursor after IMAP and SMTP verification", async () => {
    await expect(checkMailboxLogin(config)).resolves.toEqual({ ok: true, uidValidity: "123", lastUid: 8 });
    expect(imap.logout).toHaveBeenCalledOnce();
    expect(smtp.verify).toHaveBeenCalledOnce();
    expect(smtp.close).toHaveBeenCalledOnce();
  });

  it("rejects a missing inbox status without accepting a zero cursor", async () => {
    imap.status.mockResolvedValue(false);
    await expect(checkMailboxLogin(config)).resolves.toEqual({ ok: false, reason: "other" });
    expect(imap.close).toHaveBeenCalledOnce();
    expect(imap.logout).not.toHaveBeenCalled();
    expect(smtpTransportFor).not.toHaveBeenCalled();
  });

  it("closes SMTP when verification fails", async () => {
    smtp.verify.mockRejectedValue({ code: "EAUTH" });
    await expect(checkMailboxLogin(config)).resolves.toEqual({ ok: false, reason: "auth" });
    expect(smtp.close).toHaveBeenCalledOnce();
  });
});
