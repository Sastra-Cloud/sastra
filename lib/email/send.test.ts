import { describe, expect, it, vi } from "vitest";

import {
  addressOf,
  buildResendPayload,
  defaultFromAddress,
  domainOf,
  emailProviderConfigured,
  newMessageId,
  resolveEmailProvider,
  sendMail,
  sendViaResend,
} from "./send";

describe("provider selection", () => {
  it("defaults to SMTP, switches to Resend when a key is present, and honors an explicit choice", () => {
    expect(resolveEmailProvider({})).toBe("smtp");
    expect(resolveEmailProvider({ RESEND_API_KEY: "re_x" })).toBe("resend");
    expect(resolveEmailProvider({ RESEND_API_KEY: "re_x", EMAIL_PROVIDER: "smtp" })).toBe("smtp");
    expect(resolveEmailProvider({ EMAIL_PROVIDER: "RESEND" })).toBe("resend");
  });

  it("knows whether the chosen provider is configured", () => {
    expect(emailProviderConfigured({})).toBe(false);
    expect(emailProviderConfigured({ SMTP_HOST: "localhost" })).toBe(true);
    expect(emailProviderConfigured({ EMAIL_PROVIDER: "resend" })).toBe(false);
    expect(emailProviderConfigured({ RESEND_API_KEY: "re_x" })).toBe(true);
  });

  it("prefers EMAIL_FROM over SMTP_FROM", () => {
    expect(defaultFromAddress({ SMTP_FROM: "A <a@x.org>" })).toBe("A <a@x.org>");
    expect(defaultFromAddress({ SMTP_FROM: "A <a@x.org>", EMAIL_FROM: "B <b@y.org>" })).toBe("B <b@y.org>");
  });
});

describe("addresses and message ids", () => {
  it("extracts the bare address and its domain", () => {
    expect(addressOf("Sastra <noreply@sastra.cloud>")).toBe("noreply@sastra.cloud");
    expect(addressOf("plain@example.org")).toBe("plain@example.org");
    expect(domainOf("Sastra <noreply@sastra.cloud>")).toBe("sastra.cloud");
    expect(domainOf("nonsense")).toBe("localhost");
  });

  it("generates a bracketed Message-ID on the sender's domain", () => {
    expect(newMessageId("Team <office@mail.example.org>")).toMatch(/^<[0-9a-f-]{36}@mail\.example\.org>$/);
  });
});

describe("buildResendPayload", () => {
  it("maps fields, threading headers, and attachments", () => {
    const payload = buildResendPayload({
      from: "Team <office@mail.example.org>",
      to: "printer@example.com",
      cc: ["a@example.org"],
      replyTo: "office+t1@mail.example.org",
      subject: "Quote",
      text: "Hello",
      html: "<p>Hello</p>",
      messageId: "<m1@mail.example.org>",
      inReplyTo: "<their@example.com>",
      references: "<r0@example.com> <their@example.com>",
      headers: { "List-Unsubscribe": "<https://x/u>" },
      attachments: [{ filename: "a.pdf", content: Buffer.from("pdf"), contentType: "application/pdf" }],
    });
    expect(payload).toEqual({
      from: "Team <office@mail.example.org>",
      to: ["printer@example.com"],
      cc: ["a@example.org"],
      reply_to: "office+t1@mail.example.org",
      subject: "Quote",
      text: "Hello",
      html: "<p>Hello</p>",
      headers: {
        "List-Unsubscribe": "<https://x/u>",
        "Message-ID": "<m1@mail.example.org>",
        "In-Reply-To": "<their@example.com>",
        References: "<r0@example.com> <their@example.com>",
      },
      attachments: [{ filename: "a.pdf", content: Buffer.from("pdf").toString("base64"), content_type: "application/pdf" }],
    });
  });

  it("omits empty optional fields", () => {
    const payload = buildResendPayload({ from: "a@b.c", to: ["x@y.z"], subject: "s", messageId: "<1@b.c>" });
    expect(payload).toEqual({ from: "a@b.c", to: ["x@y.z"], subject: "s", headers: { "Message-ID": "<1@b.c>" } });
  });
});

describe("sendViaResend", () => {
  it("posts to the API with the key and returns the provider id", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.resend.com/emails");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
      expect(JSON.parse(String(init?.body)).to).toEqual(["x@y.z"]);
      return new Response(JSON.stringify({ id: "abc" }), { status: 200 });
    });
    const result = await sendViaResend(
      { from: "a@b.c", to: "x@y.z", subject: "s", messageId: "<1@b.c>" },
      { apiKey: "re_test", fetchImpl: fetchImpl as unknown as typeof fetch }
    );
    expect(result).toEqual({ provider: "resend", messageId: "<1@b.c>", providerId: "abc" });
  });

  it("surfaces API errors without the key", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ message: "Domain is not verified" }), { status: 403 });
    await expect(
      sendViaResend(
        { from: "a@b.c", to: "x@y.z", subject: "s", messageId: "<1@b.c>" },
        { apiKey: "re_secret", fetchImpl: fetchImpl as unknown as typeof fetch }
      )
    ).rejects.toThrow("Resend rejected the email (HTTP 403): Domain is not verified");
  });
});

describe("sendMail", () => {
  it("fills in the From address and a Message-ID, then sends over the given SMTP transport", async () => {
    const sent: unknown[] = [];
    const transport = {
      sendMail: async (mail: Record<string, unknown>) => {
        sent.push(mail);
        return { messageId: mail.messageId as string };
      },
    };
    const result = await sendMail(
      { to: "x@y.z", subject: "s", text: "t" },
      { transport: transport as never, env: { SMTP_FROM: "Sastra <noreply@sastra.cloud>" } }
    );
    expect(result.provider).toBe("smtp");
    expect(result.messageId).toMatch(/@sastra\.cloud>$/);
    expect(sent[0]).toMatchObject({ from: "Sastra <noreply@sastra.cloud>", to: "x@y.z", messageId: result.messageId });
  });

  it("refuses to send through Resend without a key", async () => {
    await expect(
      sendMail({ to: "x@y.z", subject: "s" }, { env: { EMAIL_PROVIDER: "resend" } })
    ).rejects.toThrow("RESEND_API_KEY is not set.");
  });
});
