import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), extract: vi.fn(), extractInvoice: vi.fn(),
  save: vi.fn(), insert: vi.fn(), log: vi.fn(), rows: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/imports/file-access", () => ({ getAccessibleExtractionFile: mocks.access }));
vi.mock("@/lib/print/extract", () => ({
  runPrintQuoteExtraction: mocks.extract, insertSuggestedQuote: mocks.save,
  extractPrintInvoice: mocks.extractInvoice,
}));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => mocks.rows }) }) }),
  insert: mocks.insert,
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: mocks.log }));
vi.mock("@/lib/notifications", () => ({}));
vi.mock("@/lib/print/wire-payment-review", () => ({}));
vi.mock("@/lib/ai/openrouter", () => ({}));
vi.mock("@/lib/blockers/engine", () => ({}));
vi.mock("@/lib/gmail", () => ({}));
vi.mock("@/lib/r2", () => ({}));
vi.mock("@/lib/print/email-link", () => ({}));
vi.mock("@/lib/budget/queries", () => ({}));
vi.mock("@/lib/budget/approval-service", () => ({}));
vi.mock("@/lib/print/budget-sync", () => ({}));
vi.mock("@/lib/print/run-status", () => ({}));
vi.mock("@/lib/print/email-text-extract", () => ({}));
vi.mock("@/lib/print/payment-tasks", () => ({}));
vi.mock("@/lib/print/queries", () => ({}));
vi.mock("@/lib/workspace/queries", () => ({}));
vi.mock("@/lib/email/operational-drafts", () => ({}));
vi.mock("@/lib/email/draft-store", () => ({}));
vi.mock("@/lib/document-learning/service", () => ({}));
vi.mock("@/lib/document-learning/source", () => ({}));

import { createQuoteFromFile, retryExtraction } from "./actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  mocks.access.mockResolvedValue(null);
  mocks.rows = [{ id: "run", projectId: "project", slug: "project", title: "Book" }];
  mocks.insert.mockReturnValue({ values: async () => undefined });
  mocks.save.mockResolvedValue("quote");
});

describe("manual print file authorization", () => {
  it("rejects an inaccessible file before extraction or shared quote attachment", async () => {
    expect(await createQuoteFromFile("run", "file")).toMatchObject({ error: expect.any(String) });
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("passes the authorized manager to extraction and preserves the suggested-quote workflow", async () => {
    mocks.access.mockResolvedValue({ id: "file" });
    mocks.extract.mockResolvedValue({ kind: "quote", issueDate: null });
    expect(await createQuoteFromFile("run", "file")).toEqual({ id: "quote" });
    expect(mocks.extract).toHaveBeenCalledWith({ fileId: "file", projectId: "project", actorUserId: "manager", runId: "run" });
    expect(mocks.save).toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it("checks access before retrying an existing PDF extraction job", async () => {
    mocks.rows = [{ id: "job", kind: "pdf", fileId: "file", runId: "run", projectId: "project" }];
    expect(await retryExtraction("job")).toMatchObject({ error: expect.any(String) });
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
    expect(mocks.extractInvoice).not.toHaveBeenCalled();
  });
});
