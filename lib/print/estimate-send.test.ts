import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  ctx: vi.fn(),
  access: vi.fn(),
  storage: vi.fn(),
  send: vi.fn(),
  link: vi.fn(),
  update: vi.fn(),
  select: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: m.auth }));
vi.mock("@/lib/imports/file-access", () => ({
  getAccessibleExtractionFile: m.access,
}));
vi.mock("@/lib/print/queries", () => ({ getRunWithProject: m.ctx }));
vi.mock("@/lib/db", () => ({ db: { select: m.select, update: m.update } }));
vi.mock("@/lib/gmail", () => ({ sendEmail: m.send }));
vi.mock("@/lib/r2", () => ({ getObjectBuffer: m.storage }));
vi.mock("@/lib/print/email-link", () => ({ linkPrintThread: m.link }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/notifications", () => ({}));
vi.mock("@/lib/print/wire-payment-review", () => ({}));
vi.mock("@/lib/ai/openrouter", () => ({}));
vi.mock("@/lib/blockers/engine", () => ({}));
vi.mock("@/lib/budget/queries", () => ({}));
vi.mock("@/lib/budget/approval-service", () => ({}));
vi.mock("@/lib/print/budget-sync", () => ({}));
vi.mock("@/lib/print/estimate-review-actions", () => ({}));
vi.mock("@/lib/print/run-status", () => ({}));
vi.mock("@/lib/print/email-text-extract", () => ({}));
vi.mock("@/lib/print/payment-tasks", () => ({}));
vi.mock("@/lib/print/extract", () => ({}));
vi.mock("@/lib/workspace/queries", () => ({}));
vi.mock("@/lib/email/operational-drafts", () => ({}));
vi.mock("@/lib/email/draft-store", () => ({
  removeEmailDraftForUser: vi.fn(),
}));
vi.mock("@/lib/document-learning/service", () => ({}));
vi.mock("@/lib/document-learning/source", () => ({}));
import { sendPrintRfq } from "./actions";

const fileId = "550e8400-e29b-41d4-a716-446655440000";
const input = {
  subject: "Budget estimate",
  body: "Quote 240 pages, 2000 copies.",
  ccEmails: ["review@example.com"],
  reviewedReferenceFileId: fileId,
  reviewedRecipientEmail: "printer@example.com",
};
let context: Record<string, unknown>;
let patches: Record<string, unknown>[];
let claim: boolean;
beforeEach(() => {
  vi.resetAllMocks();
  patches = [];
  claim = true;
  m.auth.mockResolvedValue({ user: { id: "manager" } });
  context = {
    run: {
      id: "r",
      projectId: "p",
      kind: "budget_estimate",
      referenceFileId: fileId,
    },
    contact: { id: "printer", email: "printer@example.com", name: "Printer" },
    settings: { ccEmails: [] },
  };
  m.ctx.mockImplementation(async () => context);
  m.access.mockResolvedValue({
    id: fileId,
    r2Key: "private/reference.pdf",
    originalName: "English.pdf",
    mimeType: "application/pdf",
    sizeBytes: 123,
  });
  m.storage.mockResolvedValue(Buffer.from("%PDF-example"));
  m.send.mockResolvedValue({ threadKey: "sent-key" });
  m.select.mockReturnValue({
    from: () => ({
      where: () => ({ limit: async () => [{ id: "thread", slug: "book" }] }),
    }),
  });
  m.update.mockReturnValue({
    set: (patch: Record<string, unknown>) => {
      patches.push(patch);
      return {
        where: () => ({
          returning: async () => (claim ? [{ id: "r" }] : []),
          then: (resolve: (r: unknown) => unknown) => resolve([]),
        }),
      };
    },
  });
});

describe("reviewed estimate send", () => {
  it("sends the exact reviewed PDF and CC, with a stable request identity and thread association", async () => {
    expect(await sendPrintRfq("r", input)).toEqual({});
    expect(m.auth).toHaveBeenCalledWith("manager");
    expect(m.access).toHaveBeenCalledWith(fileId, "manager");
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["printer@example.com"],
        cc: input.ccEmails,
        subject: input.subject,
        bodyText: input.body,
        idempotencyKey: "print-estimate:r",
        attachments: [
          {
            filename: "English.pdf",
            contentType: "application/pdf",
            content: Buffer.from("%PDF-example"),
          },
        ],
      }),
    );
    expect(m.link).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "r",
        existingProjectId: "p",
        threadId: "thread",
      }),
    );
  });
  it("allows a page-count-only request without fetching any PDF", async () => {
    context.run = {
      id: "r",
      projectId: "p",
      kind: "budget_estimate",
      referenceFileId: null,
    };
    expect(
      await sendPrintRfq("r", { ...input, reviewedReferenceFileId: null }),
    ).toEqual({});
    expect(m.access).not.toHaveBeenCalled();
    expect(m.storage).not.toHaveBeenCalled();
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [] }),
    );
  });
  it("blocks changed recipients, unreviewed attachments, and inaccessible files before sending", async () => {
    expect(
      await sendPrintRfq("r", {
        ...input,
        reviewedRecipientEmail: "old@example.com",
      }),
    ).toHaveProperty("error");
    expect(
      await sendPrintRfq("r", { ...input, reviewedReferenceFileId: null }),
    ).toHaveProperty("error");
    m.access.mockResolvedValue(null);
    expect(await sendPrintRfq("r", input)).toHaveProperty("error");
    expect(m.send).not.toHaveBeenCalled();
    expect(m.storage).not.toHaveBeenCalled();
  });
  it("prevents concurrent duplicate sending and makes failed delivery retryable", async () => {
    claim = false;
    expect(await sendPrintRfq("r", input)).toHaveProperty("error");
    expect(m.send).not.toHaveBeenCalled();
    claim = true;
    m.send.mockRejectedValueOnce(new Error("Mail service unavailable"));
    expect(await sendPrintRfq("r", input)).toEqual({
      error: "Email was not sent: Mail service unavailable",
    });
    expect(patches.at(-1)).toMatchObject({ status: "planning" });
    expect(await sendPrintRfq("r", input)).toEqual({});
  });
  it("enforces manager authorization before loading private attachments or sending", async () => {
    m.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(sendPrintRfq("r", input)).rejects.toThrow("Forbidden");
    expect(m.access).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
});
