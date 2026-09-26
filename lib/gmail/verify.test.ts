import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./imap", () => ({ imapClientFor: vi.fn() }));
vi.mock("./send", () => ({ smtpTransportFor: vi.fn() }));

import { classifyMailboxError } from "./verify";

describe("Gmail connection errors", () => {
  it("separates a wrong password from a network problem", () => {
    expect(classifyMailboxError({ authenticationFailed: true })).toBe("auth");
    expect(classifyMailboxError({ responseCode: 535, message: "5.7.8 Username and Password not accepted" })).toBe("auth");
    expect(classifyMailboxError({ code: "ETIMEDOUT" })).toBe("network");
    expect(classifyMailboxError(new Error("something odd"))).toBe("other");
  });
});
