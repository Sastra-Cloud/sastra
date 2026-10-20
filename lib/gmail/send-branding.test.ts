import { beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import { correspondenceFrom } from "@/lib/email/identity";

const { sendMail, recordOutbound, getWorkspaceSettings } = vi.hoisted(() => ({
  sendMail: vi.fn(), recordOutbound: vi.fn(), getWorkspaceSettings: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email/send", () => ({ sendMail }));
vi.mock("@/lib/workspace/queries", () => ({ getWorkspaceSettings }));
vi.mock("./config", () => ({
  getCorrespondenceAddress: async () => "correspondence@example.test",
  canSendAsCorrespondenceAddress: async () => true,
  getMailboxConfig: async () => null,
}));
vi.mock("./sync", () => ({ recordOutbound }));
import { sendEmail } from "./send";

beforeEach(() => {
  vi.clearAllMocks();
  getWorkspaceSettings.mockResolvedValue({ orgName: "Example Publishing" });
  sendMail.mockResolvedValue({ messageId: "<sent@example.test>" });
});

describe("correspondence branding", () => {
  it("sets workspace display identity while preserving the reviewed content and reply headers", async () => {
    const input = { to: ["partner@example.test"], cc: ["reviewer@example.test"], subject: "Re: Article series", bodyText: "Reviewed wording\n\nBest,\nSam", inReplyTo: "<prior@example.test>", references: "<root@example.test>", attachments: [{ filename: "invoice.pdf", content: Buffer.from("invoice"), contentType: "application/pdf" }] };
    await sendEmail(input);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: '"Example Publishing" <correspondence@example.test>', to: input.to, cc: input.cc, subject: input.subject, text: input.bodyText, attachments: input.attachments, inReplyTo: input.inReplyTo, references: "<root@example.test> <prior@example.test>" }), {});
    expect(recordOutbound).toHaveBeenCalledWith(expect.objectContaining({ subject: input.subject, bodyText: input.bodyText }));
  });

  it("quotes punctuation and strips header control characters in workspace names", async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    try {
      const from = correspondenceFrom("team@example.test", 'Example "Books", Inc.\r\nBcc: someone@example.test');
      const message = await transport.sendMail({ from, to: "partner@example.test", subject: "Invoice", text: "Reviewed message" });
      const parsed = await simpleParser(message.message);
      expect(parsed.from?.value).toEqual([{ address: "team@example.test", name: 'Example "Books", Inc. Bcc: someone@example.test' }]);
      expect(parsed.bcc).toBeUndefined();
    } finally { transport.close(); }
  });

  it("uses the configured address when organization identity is missing", () => {
    expect(correspondenceFrom("team@example.test", "  ")).toBe("team@example.test");
  });
});
