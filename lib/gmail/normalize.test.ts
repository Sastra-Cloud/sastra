import { describe, expect, it } from "vitest";
import type { ParsedMail } from "mailparser";

import { normalizeParsed } from "./normalize";

/** Build a minimal ParsedMail-ish object for the mapper (only fields it reads). */
function mail(overrides: Record<string, unknown>): ParsedMail {
  return {
    attachments: [],
    headers: new Map(),
    headerLines: [],
    ...overrides,
  } as unknown as ParsedMail;
}
const addr = (list: { address: string; name?: string }[]) => ({ value: list });

describe("normalizeParsed", () => {
  it("maps addresses (lowercased), subject, bodies, and date", () => {
    const n = normalizeParsed(
      mail({
        messageId: "<m1@crossway.org>",
        from: addr([{ address: "Rights@Crossway.ORG", name: "Crossway" }]),
        to: addr([{ address: "projects@example.net" }]),
        cc: addr([{ address: "nathan@example.org" }]),
        subject: "MoU",
        text: "hello",
        html: "<p>hello</p>",
        date: new Date("2024-01-02T03:04:05Z"),
      }),
      { providerThreadId: "1278455344230334865" }
    );
    expect(n.messageId).toBe("<m1@crossway.org>");
    expect(n.from).toEqual({ email: "rights@crossway.org", name: "Crossway" });
    expect(n.to).toEqual([{ email: "projects@example.net" }]);
    expect(n.cc).toEqual([{ email: "nathan@example.org" }]);
    expect(n.text).toBe("hello");
    expect(n.html).toBe("<p>hello</p>");
    expect(n.date?.toISOString()).toBe("2024-01-02T03:04:05.000Z");
    expect(n.providerThreadId).toBe("1278455344230334865");
  });

  it("uses the first Reference as the thread key", () => {
    const n = normalizeParsed(
      mail({
        messageId: "<reply@x.org>",
        references: ["<root@x.org>", "<mid@x.org>"],
        inReplyTo: "<mid@x.org>",
        from: addr([{ address: "a@x.org" }]),
      })
    );
    expect(n.threadKey).toBe("<root@x.org>");
    expect(n.references).toBe("<root@x.org> <mid@x.org>");
  });

  it("splits a string References header", () => {
    const n = normalizeParsed(
      mail({
        messageId: "<r@x.org>",
        references: "<root@x.org> <b@x.org>",
        from: addr([{ address: "a@x.org" }]),
      })
    );
    expect(n.threadKey).toBe("<root@x.org>");
  });

  it("falls back to In-Reply-To, then to its own Message-ID", () => {
    expect(
      normalizeParsed(mail({ messageId: "<self@x.org>", inReplyTo: "<parent@x.org>" }))
        .threadKey
    ).toBe("<parent@x.org>");
    expect(
      normalizeParsed(mail({ messageId: "<self@x.org>" })).threadKey
    ).toBe("<self@x.org>");
  });

  it("maps attachments with in-memory content", () => {
    const content = Buffer.from("PDFDATA");
    const n = normalizeParsed(
      mail({
        messageId: "<a@x.org>",
        attachments: [
          { filename: "mou.pdf", contentType: "application/pdf", size: 7, content },
        ],
      })
    );
    expect(n.attachments).toEqual([
      { filename: "mou.pdf", mimeType: "application/pdf", size: 7, content },
    ]);
  });
});
