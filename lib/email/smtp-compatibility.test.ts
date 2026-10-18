import { describe, expect, it } from "vitest";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";

describe("SMTP message compatibility", () => {
  it("round-trips correspondence headers and attachments without sending mail", async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const attachment = Buffer.from("Invoice review attachment");
    try {
      const message = await transport.sendMail({
        from: "Workspace <capture@example.org>",
        to: "Printer <printer@example.org>",
        cc: ["reviewer@example.org"],
        subject: "Print review — revised quote",
        text: "Please review the attached quote.",
        messageId: "<review@example.org>",
        inReplyTo: "<quote@example.org>",
        references: "<request@example.org> <quote@example.org>",
        attachments: [{ filename: "quote.pdf", content: attachment, contentType: "application/pdf" }],
      });
      const parsed = await simpleParser(message.message);
      expect(parsed.messageId).toBe("<review@example.org>");
      expect(parsed.inReplyTo).toBe("<quote@example.org>");
      expect(parsed.references).toEqual(["<request@example.org>", "<quote@example.org>"]);
      expect(parsed.subject).toBe("Print review — revised quote");
      expect(parsed.text?.trim()).toBe("Please review the attached quote.");
      expect(parsed.cc).toMatchObject({ value: [{ address: "reviewer@example.org" }] });
      expect(parsed.attachments).toHaveLength(1);
      expect(parsed.attachments[0]).toMatchObject({ filename: "quote.pdf", contentType: "application/pdf" });
      expect(parsed.attachments[0].content).toEqual(attachment);
    } finally {
      transport.close();
    }
  });
});
