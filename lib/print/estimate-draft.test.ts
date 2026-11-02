import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  create: vi.fn(),
  draft: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: m.auth }));
vi.mock("@/lib/imports/file-access", () => ({
  getAccessibleExtractionFile: m.access,
}));
vi.mock("@/lib/print/actions", () => ({
  createPrintRun: m.create,
  draftPrintRfq: m.draft,
}));
vi.mock("@/lib/print/queries", () => ({
  getOrCreatePrintSettings: async () => ({ ccEmails: [] }),
}));
vi.mock("@/lib/email/draft-store", () => ({ saveEmailDraftForUser: m.save }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ email: "printer@example.com" }],
        }),
      }),
    }),
    update: m.update,
    insert: m.insert,
  },
}));
import { draftPrintEstimate } from "./estimate-actions";
const fileId = "550e8400-e29b-41d4-a716-446655440000";
const input = {
  contactId: fileId,
  referenceFileId: fileId,
  pageCount: 240,
  quantities: [2000, 3000],
  textPaper: "",
  coverPaper: "",
  binding: "",
  notes: "",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.auth.mockResolvedValue({ user: { id: "manager" } });
  m.create.mockResolvedValue({ id: "request" });
  m.draft.mockResolvedValue({
    subject: "Estimate",
    body: "240 estimated pages",
  });
  m.save.mockImplementation(async (_user, data) => data);
  m.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
  m.insert.mockReturnValue({ values: async () => undefined });
});
describe("estimate draft provenance", () => {
  it("rejects private or oversized reference files before creating a shared request", async () => {
    m.access.mockResolvedValue(null);
    expect(await draftPrintEstimate("project", input)).toHaveProperty("error");
    m.access.mockResolvedValue({
      mimeType: "application/pdf",
      sizeBytes: 16 * 1024 * 1024,
    });
    expect(await draftPrintEstimate("project", input)).toHaveProperty("error");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("prepares a recoverable page-count-only estimate without requiring a PDF", async () => {
    const result = await draftPrintEstimate("project", {
      ...input,
      referenceFileId: null,
      trimWidthIn: 5.5,
      trimHeightIn: 8.5,
      textPaper: "70 gsm cream, black ink",
      coverPaper: "250 gsm, matte lamination",
      binding: "Perfect bound",
    });
    expect(result).toMatchObject({
      runId: "request",
      referenceFileId: null,
      attachment: null,
    });
    expect(m.create).toHaveBeenCalledWith(
      "project",
      expect.objectContaining({
        kind: "budget_estimate",
        requestedQuantities: [2000, 3000],
        trimWidthIn: 5.5,
        trimHeightIn: 8.5,
        textPaper: "70 gsm cream, black ink",
        coverPaper: "250 gsm, matte lamination",
        binding: "Perfect bound",
      }),
    );
    expect(m.save).toHaveBeenCalledWith(
      "manager",
      expect.objectContaining({
        contextId: "request",
        kind: "print_rfq",
        body: "240 estimated pages",
      }),
    );
    expect(m.access).not.toHaveBeenCalled();
  });
  it("rejects an invalid request size before creating a run or printer email draft", async () => {
    await expect(draftPrintEstimate("project", {
      ...input, referenceFileId: null, trimWidthIn: 0, trimHeightIn: 8.5,
    })).rejects.toThrow();
    expect(m.create).not.toHaveBeenCalled();
    expect(m.draft).not.toHaveBeenCalled();
  });
  it("denies non-managers before sharing any file", async () => {
    m.auth.mockRejectedValue(new Error("Forbidden"));
    await expect(draftPrintEstimate("project", input)).rejects.toThrow(
      "Forbidden",
    );
    expect(m.access).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
});
