import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/auth/guards", () => ({ requireRole: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("./queries", () => ({ getOrCreateBudgetSettings: mocks.settings }));
vi.mock("./revalidate", () => ({ revalidateBudget: vi.fn() }));

import { createGuidedBudget } from "./setup-actions";

const input = {
  requestId: "5b0f3c9e-6f0f-4c0a-9a53-0c6b3a2f1d11",
  wordCount: 40_000,
  sourcePageCount: 0,
  lines: [
    {
      category: "translation" as const,
      label: "Translation",
      unit: "words" as const,
      quantity: 0,
      unitPrice: 0.05,
      autoQuantity: true,
    },
  ],
  partner: null,
};

it("rejects members before reading settings or writing any budget record", async () => {
  mocks.auth.mockRejectedValue(new Error("Forbidden"));
  await expect(createGuidedBudget("project", input)).rejects.toThrow("Forbidden");
  expect(mocks.auth).toHaveBeenCalledWith("manager");
  expect(mocks.settings).not.toHaveBeenCalled();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("refuses a printing cost and an empty cost list without touching the database", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "manager" } });
  const printing = await createGuidedBudget("project", {
    ...input,
    lines: [{ ...input.lines[0], category: "print_ship", label: "Print" }],
  });
  const empty = await createGuidedBudget("project", { ...input, lines: [] });
  expect(printing).toEqual({ error: "Add the printing cost from a printer estimate." });
  expect(empty).toEqual({ error: "Choose at least one cost." });
  expect(mocks.settings).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
