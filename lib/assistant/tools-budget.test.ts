import { expect, it, vi } from "vitest";
import { parseToolArgs } from "./agent-util";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/budget/line-invoice-actions", () => ({ previewBudgetLineInvoice: mocks.preview, createBudgetLineInvoice: mocks.create }));
import { getTool, type ToolContext } from "./tools";

const ctx: ToolContext = {
  userId: "manager", role: "manager", timezone: "UTC",
  currentProjectId: "00000000-0000-4000-8000-000000000001",
  actionIdempotencyKey: "00000000-0000-4000-8000-000000000003",
};

it("carries the reviewed live price through persisted argument validation and approval execution", async () => {
  const tool = getTool("create_budget_invoice")!;
  const args = { budgetItemIds: ["00000000-0000-4000-8000-000000000002"] };
  mocks.preview.mockResolvedValue({ plan: {
    fingerprint: "a".repeat(64), description: "Example book\n- Audiobook Production",
    currency: "USD", amount: "590.00", recipientName: "Partner", recipientEmail: "partner@example.org", recipientAddress: "Address", dueDate: null,
  } });
  mocks.create.mockResolvedValue({ invoiceId: "invoice", paymentId: ctx.actionIdempotencyKey, invoiceNumber: "001" });
  expect(await tool.preview!(ctx, args)).toContain("USD 590.00");
  const persisted = parseToolArgs(JSON.stringify(args), tool.parameters);
  const result = JSON.parse(await tool.run(ctx, persisted));
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
    projectId: ctx.currentProjectId, requestId: ctx.actionIdempotencyKey,
    reviewedFingerprint: "a".repeat(64), budgetItemIds: args.budgetItemIds,
  }));
  expect(result).toMatchObject({ invoiceId: "invoice", url: "/api/invoices/invoice", sent: false });
});

it("cannot execute after a failed preview, even with a model-supplied review token", async () => {
  mocks.create.mockClear();
  mocks.preview.mockResolvedValue({ error: "The cost is hidden." });
  const tool = getTool("create_budget_invoice")!;
  const args = { budgetItemIds: ["00000000-0000-4000-8000-000000000002"], reviewedFingerprint: "a".repeat(64) };
  await expect(tool.preview!(ctx, args)).rejects.toThrow("hidden");
  expect(JSON.parse(await tool.run(ctx, args)).error).toContain("review");
  expect(mocks.create).not.toHaveBeenCalled();
});
