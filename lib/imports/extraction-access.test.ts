import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), emailAccess: vi.fn(), presign: vi.fn(), fetch: vi.fn(), ai: vi.fn(),
  set: vi.fn(), imp: {} as Record<string, unknown>,
}));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [mocks.imp] }) }) }),
  update: () => ({ set: mocks.set }),
} }));
vi.mock("./file-access", () => ({ getAccessibleExtractionFile: mocks.access, getEmailExtractionFile: mocks.emailAccess }));
vi.mock("@/lib/r2", () => ({ presignGet: mocks.presign }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/openrouter", () => ({ aiStructuredFromDocument: mocks.ai }));
vi.mock("@/lib/ai/usage", () => ({ recordR2Operation: vi.fn() }));
vi.mock("@/lib/ai/error-details", () => ({ describeAiError: () => ({ diagnostic: {}, userMessage: "Download failed." }) }));
vi.mock("@/lib/workspace/queries", () => ({}));
vi.mock("@/lib/document-learning/source", () => ({}));
vi.mock("@/lib/document-learning/service", () => ({}));
vi.mock("./fx", () => ({}));

import { runExtraction } from "./extraction";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.imp = { id: "import", fileId: "file", createdBy: "creator", status: "parsing",
    updatedAt: new Date("2026-01-01T00:00:00.000Z") };
  mocks.set.mockReturnValue({ where: async () => undefined });
  mocks.access.mockResolvedValue(null);
  mocks.emailAccess.mockResolvedValue(null);
  mocks.presign.mockResolvedValue("https://storage.invalid/fixture");
  mocks.fetch.mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", mocks.fetch);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("detached document extraction authorization", () => {
  it("rechecks the persisted creator and stops before storage when access was revoked after enqueue", async () => {
    await runExtraction("import");
    expect(mocks.access).toHaveBeenCalledWith("file", "creator");
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorKind: "file" }));
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it("does not turn a deleted creator into unrestricted system authority", async () => {
    mocks.imp.createdBy = null;
    await runExtraction("import");
    expect(mocks.emailAccess).not.toHaveBeenCalled();
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it("does not fall back to system authority for a revoked creator with email metadata", async () => {
    Object.assign(mocks.imp, { fundingSourceKey: "fingerprint", sourceMessageId: "message", sourceThreadId: "thread" });
    await runExtraction("import");
    expect(mocks.emailAccess).not.toHaveBeenCalled();
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it("preserves automated funding intake only when its persisted email provenance still matches", async () => {
    Object.assign(mocks.imp, { createdBy: null, fundingSourceKey: "fingerprint", sourceMessageId: "message", sourceThreadId: "thread" });
    await runExtraction("import");
    expect(mocks.emailAccess).toHaveBeenCalledWith("file", "message", "thread");
    expect(mocks.presign).not.toHaveBeenCalled();

    mocks.emailAccess.mockResolvedValue({ r2Key: "email/document" });
    await runExtraction("import");
    expect(mocks.presign).toHaveBeenCalledWith("email/document");
    expect(mocks.fetch).toHaveBeenCalledWith("https://storage.invalid/fixture");
  });

  it("allows storage access for a still-authorized creator", async () => {
    mocks.access.mockResolvedValue({ r2Key: "shared/document" });
    await runExtraction("import");
    expect(mocks.presign).toHaveBeenCalledWith("shared/document");
    expect(mocks.emailAccess).not.toHaveBeenCalled();
  });

  it("uses the authorized retry requester when the original creator is no longer active", async () => {
    mocks.access.mockImplementation(async (_fileId, actorId) =>
      actorId === "replacement" ? { r2Key: "shared/document" } : null);
    await runExtraction("import", { actorUserId: "replacement", updatedAt: mocks.imp.updatedAt as Date });
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith("file", "replacement");
    expect(mocks.presign).toHaveBeenCalledWith("shared/document");
    expect(mocks.emailAccess).not.toHaveBeenCalled();
    expect(mocks.imp.createdBy).toBe("creator");
    for (const [value] of mocks.set.mock.calls) expect(value).not.toHaveProperty("createdBy");
  });

  it("does not borrow the creator's authority if the requester loses access after retry enqueue", async () => {
    mocks.access.mockImplementation(async (_fileId, actorId) =>
      actorId === "creator" ? { r2Key: "private/document" } : null);
    Object.assign(mocks.imp, { fundingSourceKey: "fingerprint", sourceMessageId: "message", sourceThreadId: "thread" });
    await runExtraction("import", { actorUserId: "removed-requester", updatedAt: mocks.imp.updatedAt as Date });
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith("file", "removed-requester");
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(mocks.emailAccess).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorKind: "file" }));
  });

  it("does not run a superseded requester against a newer retry claim", async () => {
    await runExtraction("import", { actorUserId: "old-requester", updatedAt: new Date("2025-12-31T23:59:59.000Z") });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
