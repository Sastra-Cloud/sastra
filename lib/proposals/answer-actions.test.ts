import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), select: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, update: mocks.update, transaction: vi.fn() },
}));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/budget/queries", () => ({ getOrCreateBudgetSettings: vi.fn() }));
vi.mock("@/lib/budget/revalidate", () => ({ revalidateBudget: vi.fn() }));

import { linkReceiptToProposal, setProposalAnswer } from "./answer-actions";

const id = "5b0f3c9e-6f0f-4c0a-9a53-0c6b3a2f1d11";

it("rejects members before reading or changing any proposal or funding record", async () => {
  mocks.auth.mockRejectedValue(new Error("Forbidden"));
  await expect(
    setProposalAnswer({ proposalId: id, answer: "mou", agreedAmount: 100 })
  ).rejects.toThrow("Forbidden");
  await expect(
    linkReceiptToProposal({ receiptId: id, proposalId: id })
  ).rejects.toThrow("Forbidden");
  expect(mocks.auth).toHaveBeenCalledWith("manager");
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
