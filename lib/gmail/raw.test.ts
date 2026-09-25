import { describe, expect, it } from "vitest";

import { parseRawMessage, rawMessageObjectKey, resolveMessageId } from "./raw";

const FIXTURE = [
  "From: Crossway Rights <Rights@Crossway.ORG>",
  "To: projects@example.org",
  "Cc: Nathan <nathan@example.org>",
  "Subject: Re: MoU for The Trinity",
  "Date: Tue, 02 Jan 2024 03:04:05 +0000",
  "Message-ID: <reply-1@crossway.org>",
  "In-Reply-To: <mid@example.org>",
  "References: <root@example.org> <mid@example.org>",
  'Content-Type: multipart/mixed; boundary="b1"',
  "MIME-Version: 1.0",
  "",
  "--b1",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Attached is the signed MoU.",
  "--b1",
  "Content-Type: application/pdf; name=mou.pdf",
  "Content-Disposition: attachment; filename=mou.pdf",
  "Content-Transfer-Encoding: base64",
  "",
  Buffer.from("%PDF-1.4 fake").toString("base64"),
  "--b1--",
  "",
].join("\r\n");

describe("parseRawMessage", () => {
  it("maps one RFC 822 message onto the normalized ingest shape", async () => {
    const msg = await parseRawMessage(FIXTURE, { providerThreadId: "gm-thread-1" });
    expect(msg.messageId).toBe("<reply-1@crossway.org>");
    expect(msg.threadKey).toBe("<root@example.org>");
    expect(msg.inReplyTo).toBe("<mid@example.org>");
    expect(msg.references).toBe("<root@example.org> <mid@example.org>");
    expect(msg.providerThreadId).toBe("gm-thread-1");
    expect(msg.from).toEqual({ email: "rights@crossway.org", name: "Crossway Rights" });
    expect(msg.to).toEqual([{ email: "projects@example.org" }]);
    expect(msg.cc).toEqual([{ email: "nathan@example.org", name: "Nathan" }]);
    expect(msg.subject).toBe("Re: MoU for The Trinity");
    expect(msg.text?.trim()).toBe("Attached is the signed MoU.");
    expect(msg.date?.toISOString()).toBe("2024-01-02T03:04:05.000Z");
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].filename).toBe("mou.pdf");
    expect(msg.attachments[0].mimeType).toBe("application/pdf");
    expect(msg.attachments[0].content.toString()).toBe("%PDF-1.4 fake");
  });

  it("accepts a Buffer and defaults the provider thread id to null", async () => {
    const msg = await parseRawMessage(Buffer.from(FIXTURE));
    expect(msg.providerThreadId).toBeNull();
    expect(msg.messageId).toBe("<reply-1@crossway.org>");
  });
});

describe("resolveMessageId", () => {
  it("uses the header when present and a stable synthesized id otherwise", async () => {
    const withId = await parseRawMessage(FIXTURE);
    expect(resolveMessageId(withId)).toBe("<reply-1@crossway.org>");

    const noId = await parseRawMessage(
      "From: a@example.org\r\nSubject: no id\r\nDate: Tue, 02 Jan 2024 03:04:05 +0000\r\n\r\nbody\r\n"
    );
    expect(noId.messageId).toBe("");
    const first = resolveMessageId(noId);
    expect(first).toMatch(/^synthetic-sha256:[0-9a-f]{64}$/);
    expect(resolveMessageId(noId)).toBe(first);
  });
});

describe("rawMessageObjectKey", () => {
  it("derives a stable key from the Message-ID", () => {
    const key = rawMessageObjectKey("<reply-1@crossway.org>");
    expect(key).toMatch(/^email\/raw\/[0-9a-f]{64}\.eml$/);
    expect(rawMessageObjectKey("  <reply-1@crossway.org> ")).toBe(key);
    expect(rawMessageObjectKey("<other@crossway.org>")).not.toBe(key);
  });
});
