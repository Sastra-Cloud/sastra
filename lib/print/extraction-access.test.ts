import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), emailAccess: vi.fn(), presign: vi.fn(), fetch: vi.fn(), ai: vi.fn() }));
vi.mock("@/lib/imports/file-access", () => ({ getAccessibleExtractionFile: mocks.access, getEmailExtractionFile: mocks.emailAccess }));
vi.mock("@/lib/r2", () => ({ presignGet: mocks.presign }));
vi.mock("@/lib/ai/openrouter", () => ({ aiStructuredFromDocument: mocks.ai }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/document-learning/source", () => ({}));
vi.mock("@/lib/document-learning/service", () => ({}));
vi.mock("@/lib/print/budget-sync", () => ({}));
vi.mock("@/lib/print/extraction-jobs", () => ({}));

import { runPrintQuoteExtraction } from "./extract";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(null);
  mocks.emailAccess.mockResolvedValue(null);
  mocks.presign.mockResolvedValue("https://storage.invalid/fixture");
  mocks.fetch.mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("print extraction storage boundary", () => {
  it("rechecks the actor before storage, without falling back to system email authority", async () => {
    expect(await runPrintQuoteExtraction({ fileId: "file", projectId: "project", actorUserId: "manager", sourceMessageId: "message", sourceThreadId: "thread" })).toBeNull();
    expect(mocks.access).toHaveBeenCalledWith("file", "manager");
    expect(mocks.emailAccess).not.toHaveBeenCalled();
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it("rejects an actorless file ID without email provenance", async () => {
    expect(await runPrintQuoteExtraction({ fileId: "file", projectId: "project" })).toBeNull();
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it("allows system ingestion only after checking the source email attachment", async () => {
    const input = { fileId: "file", projectId: "project", sourceMessageId: "message", sourceThreadId: "thread" };
    expect(await runPrintQuoteExtraction(input)).toBeNull();
    expect(mocks.emailAccess).toHaveBeenCalledWith("file", "message", "thread");
    expect(mocks.presign).not.toHaveBeenCalled();

    mocks.emailAccess.mockResolvedValue({ r2Key: "email/invoice" });
    await expect(runPrintQuoteExtraction(input)).rejects.toThrow("Could not download");
    expect(mocks.presign).toHaveBeenCalledWith("email/invoice");
  });
});
