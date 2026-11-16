import { beforeEach, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  eligible: vi.fn(),
  context: vi.fn(),
  snapshot: vi.fn(),
  sync: vi.fn(),
  task: vi.fn(),
  notify: vi.fn(),
  writes: [] as Array<{ table: string; value: unknown }>,
  assignment: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/auth/guards", () => ({
  requireRole: mocks.guard,
  requireUser: mocks.guard,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./partner-quotation-context", () => ({
  getPartnerQuotationContext: mocks.context,
}));
vi.mock("./approval-queries", () => ({
  listEligibleBudgetApprovers: mocks.eligible,
  getBudgetApprovalState: vi.fn(),
}));
vi.mock("./approval-service", () => ({
  syncBudgetApprovalState: mocks.sync,
  getBudgetApprovalSnapshot: mocks.snapshot,
  insertApprovalTask: mocks.task,
}));
vi.mock("@/lib/notifications", () => ({
  notify: mocks.notify,
  clearOverdueNotifications: vi.fn(),
}));
vi.mock("@/lib/activity/log", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/tasks/create", () => ({ revalidateForTask: vi.fn() }));
vi.mock("@/lib/tasks/due-date-notifications", () => ({
  reconcileTaskDueDateChange: vi.fn(),
}));
vi.mock("@/lib/db", () => {
  const db = {
    select: () => {
      let table = "";
      const query = {
        from(t: Parameters<typeof getTableName>[0]) {
          table = getTableName(t);
          return query;
        },
        where() {
          return query;
        },
        innerJoin() {
          return query;
        },
        limit: async () =>
          table === "projects"
            ? [{ title: "Book", slug: "book" }]
            : table === "budget_approval_assignments" && mocks.assignment
              ? [mocks.assignment]
              : [],
      };
      return query;
    },
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: (value: unknown) => {
        mocks.writes.push({ table: getTableName(table), value });
        return { returning: async () => [{ id: "request" }] };
      },
    }),
  };
  return {
    db: {
      ...db,
      transaction: async (callback: (tx: typeof db) => unknown) => callback(db),
    },
  };
});
import {
  approveBudgetApprovalAssignment,
  createBudgetApprovalRequest,
  requestBudgetApprovalChanges,
} from "./approval-actions";
const input = {
  projectId: "00000000-0000-4000-8000-000000000001",
  printRunId: null,
  quotationId: "00000000-0000-4000-8000-000000000002",
  approverIds: ["reviewer"],
  dueDate: "2099-01-01",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.writes = [];
  mocks.assignment = null;
  mocks.guard.mockResolvedValue({
    user: { id: "requester", name: "Requester" },
  });
  mocks.eligible.mockResolvedValue([
    { id: "reviewer", name: "Reviewer", role: "manager" },
  ]);
  mocks.context.mockResolvedValue({ quote: { title: "Printing needed" } });
  mocks.snapshot.mockResolvedValue({
    fingerprint: "snapshot",
    currency: "USD",
    totalAmount: "1090.00",
  });
  mocks.task.mockResolvedValue("task");
});

// No independent proposal endpoint may bypass workspace finance permissions.
it("requires manager permission before creating or deciding proposal approval", async () => {
  mocks.guard.mockRejectedValue(new Error("denied"));
  await expect(createBudgetApprovalRequest(input)).rejects.toThrow("denied");
  await expect(approveBudgetApprovalAssignment("assignment")).rejects.toThrow(
    "denied",
  );
  await expect(
    requestBudgetApprovalChanges("assignment", "Change printing"),
  ).rejects.toThrow("denied");
  expect(mocks.writes).toEqual([]);
});

// A valid proposal request must create a protected task scoped to that quotation, not the entire budget.
it("assigns the selected reviewer to the specific quotation and links its notification", async () => {
  expect(await createBudgetApprovalRequest(input)).toEqual({ ok: true });
  expect(mocks.snapshot).toHaveBeenCalledWith(
    input.projectId,
    null,
    input.quotationId,
  );
  expect(mocks.writes).toContainEqual({
    table: "budget_approval_requests",
    value: expect.objectContaining({
      partnerQuotationId: input.quotationId,
      requesterId: "requester",
      fingerprint: "snapshot",
    }),
  });
  expect(mocks.writes).toContainEqual({
    table: "budget_approval_assignments",
    value: { requestId: "request", approverId: "reviewer", taskId: "task" },
  });
  expect(mocks.task).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      quotationTitle: "Printing needed",
      approverId: "reviewer",
    }),
  );
  expect(mocks.notify).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: "reviewer",
      link: `/projects/book/budget#proposal-${input.quotationId}`,
    }),
  );
});

// Internal approval must not be self-assigned or delegated to an inactive/non-manager user.
it("rejects self-approval and ineligible reviewers without creating tasks", async () => {
  expect(
    await createBudgetApprovalRequest({ ...input, approverIds: ["requester"] }),
  ).toHaveProperty("error");
  mocks.eligible.mockResolvedValue([]);
  expect(await createBudgetApprovalRequest(input)).toHaveProperty("error");
  expect(mocks.task).not.toHaveBeenCalled();
  expect(mocks.writes).toEqual([]);
});

// Knowing a review assignment ID must not grant decision authority.
it("accepts decisions only from the assigned reviewer", async () => {
  mocks.assignment = {
    approverId: "reviewer",
    projectId: input.projectId,
    quotationId: input.quotationId,
  };
  expect(await approveBudgetApprovalAssignment("assignment")).toEqual({
    error: "Only the assigned approver can respond.",
  });
  expect(
    await requestBudgetApprovalChanges("assignment", "Change printing"),
  ).toEqual({ error: "Only the assigned approver can respond." });
  expect(mocks.writes).toEqual([]);
});
