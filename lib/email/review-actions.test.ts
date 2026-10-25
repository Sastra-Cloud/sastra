import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn((predicate: SQL) => { void predicate; return { returning }; });
  const set = vi.fn(() => ({ where }));
  return { returning, where, set, update: vi.fn(() => ({ set })), requireRole: vi.fn(), revalidatePath: vi.fn(), syncEstimate: vi.fn() };
});
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/db", () => ({ db: { update: mocks.update } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/print/budget-sync", () => ({ syncPrintEstimateToBudget: mocks.syncEstimate }));
vi.mock("@/lib/blockers/engine", () => ({ scheduleHealthRecompute: vi.fn() }));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));

import { dismissEmailFundingReview, dismissEmailQuoteSuggestion } from "./review-actions";

const input = { id: "1800db96-91fd-4d31-9a9a-a4c86c1f2b7b", threadId: "6452d7b8-c99b-494c-9126-f48187b7b04b" };
const projectId = "project";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue({ user: { id: "manager" } });
  mocks.returning.mockResolvedValue([{ id: input.id, projectId }]);
});

describe("email review dismissal boundaries", () => {
  it("dismisses a quote suggestion, reconciles its estimate, and refreshes the shared badge", async () => {
    expect(await dismissEmailQuoteSuggestion(input)).toEqual({});
    expect(mocks.requireRole).toHaveBeenCalledWith("manager");
    expect(mocks.set).toHaveBeenCalledWith({ reviewStatus: "rejected", updatedAt: expect.any(Date) });
    expect(mocks.syncEstimate).toHaveBeenCalledWith(projectId);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/correspondence/${input.threadId}`);
    // Structural guard: the atomic write is scoped to this thread and still-
    // suggested data, so a concurrent acceptance cannot be reversed. Browser
    // verification exercises the persisted write and the visible badge change.
    const predicate = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(predicate.sql).toContain('"print_quotes"."source_thread_id"');
    expect(predicate.sql).toContain('"print_quotes"."review_status"');
    expect(predicate.params).toEqual([input.id, input.threadId, "suggested"]);
  });

  it("discards only unapproved funding reviews from the source thread", async () => {
    expect(await dismissEmailFundingReview(input)).toEqual({});
    expect(mocks.requireRole).toHaveBeenCalledWith("manager");
    expect(mocks.set).toHaveBeenCalledWith({ status: "discarded", updatedAt: expect.any(Date) });
    const predicate = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
    expect(predicate.sql).toContain('"document_imports"."source_thread_id"');
    expect(predicate.sql).toContain('"document_imports"."status"');
    expect(predicate.params).toEqual([input.id, input.threadId, "extracted", "failed"]);
    expect(mocks.syncEstimate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reports a stale quote rather than pretending its acceptance was dismissed", async () => {
    mocks.returning.mockResolvedValue([]);
    expect((await dismissEmailQuoteSuggestion(input)).error).toContain("has changed");
    expect(mocks.syncEstimate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("preserves already-approved funding when no pending row matches", async () => {
    mocks.returning.mockResolvedValue([]);
    expect((await dismissEmailFundingReview(input)).error).toContain("has changed");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("requires manager authorization independently for both mutations", async () => {
    mocks.requireRole.mockRejectedValue(new Error("Forbidden"));
    await expect(dismissEmailQuoteSuggestion(input)).rejects.toThrow("Forbidden");
    await expect(dismissEmailFundingReview(input)).rejects.toThrow("Forbidden");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
