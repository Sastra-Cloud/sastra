import { beforeEach, expect, it, vi } from "vitest";
const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({ requireRole: vi.fn().mockResolvedValue({ user: { id: "manager" } }) }));
vi.mock("@/lib/db", () => ({ db: { transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./readiness-engine", () => ({ reevaluateSharedMouPayments: vi.fn() }));
import { approveFundingReview, type FundingReviewInput } from "./funding-actions";
const input: FundingReviewInput = {
  importId: "5bc80ba9-4312-4f85-b806-956a67c73600", name: "MoU", counterparty: "Partner",
  contactName: "Recipient", contactEmail: "recipient@example.org", signedDate: "2026-08-08",
  currency: "USD", total: 12189.37, ownerId: null,
  allocations: [{ projectId: "", amount: 9199.89 }, { projectId: "", amount: 2989.48 }],
  installments: [{ amount: 6094.69, trigger: "on_signing", earliestDate: null, paymentDueDate: null, description: "Signing", requirements: [] },
    { amount: 6094.68, trigger: "on_completion", earliestDate: null, paymentDueDate: null, description: "Delivery", requirements: ["DOCX", "MP3", "MP4"] }],
};
beforeEach(() => vi.clearAllMocks());
it("explains missing project mappings before starting a financial transaction", async () => {
  expect(await approveFundingReview(input)).toEqual({ error: "Select an existing project for every covered work." });
  expect(transaction).not.toHaveBeenCalled();
});
it("rejects duplicate mappings before starting a financial transaction", async () => {
  expect(await approveFundingReview({ ...input, allocations: input.allocations.map((row) => ({ ...row, projectId: input.importId })) }))
    .toEqual({ error: "Map each work to a different project." });
  expect(transaction).not.toHaveBeenCalled();
});
