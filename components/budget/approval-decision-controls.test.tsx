// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ approve: vi.fn(), changes: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/budget/approval-actions", () => ({
  approveBudgetApprovalAssignment: mocks.approve,
  requestBudgetApprovalChanges: mocks.changes,
}));

import { ApprovalDecisionControls } from "./approval-decision-controls";

let container: HTMLDivElement;
let root: Root;
const props = {
  assignmentId: "assignment",
  decision: "pending" as const,
  requestStatus: "pending" as const,
  canRespond: true,
  approvalKind: "proposal" as const,
};
const button = (name: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

// Financial sign-off must wait for the server, prevent duplicate decisions,
// and remain visibly settled while refreshed server props are in flight.
it("shows pending sign-off and retains the confirmed decision until a new assignment arrives", async () => {
  let finish!: (result: { ok: true }) => void;
  mocks.approve.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(() => root.render(<ApprovalDecisionControls {...props} />));
  const approve = button("Approve proposal");
  await act(() => { approve.click(); approve.click(); });
  expect(mocks.approve).toHaveBeenCalledOnce();
  expect(button("Approving…").disabled).toBe(true);
  expect(container.textContent).not.toContain("You approved");
  await act(() => finish({ ok: true }));
  expect(container.textContent).toContain("You approved this proposal");
  expect(container.querySelector("button")).toBeNull();
  await act(() => root.render(<ApprovalDecisionControls {...props} assignmentId="revised-assignment" />));
  expect(button("Approve proposal").disabled).toBe(false);
});

// Losing a requested-change note can let an incorrect financial proposal
// continue without the correction the reviewer intended.
it("preserves a change note on failure and confirms a successful retry", async () => {
  mocks.changes.mockResolvedValueOnce({ error: "The quotation changed. Review the current version." })
    .mockResolvedValueOnce({ ok: true });
  await act(() => root.render(<ApprovalDecisionControls {...props} />));
  await act(() => button("Request changes").click());
  const note = container.querySelector("textarea")!;
  expect(container.querySelector(`label[for="${note.id}"]`)).not.toBeNull();
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Check the 2,000-copy price.");
    note.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => button("Send change request").click());
  expect(mocks.changes).toHaveBeenCalledWith("assignment", "Check the 2,000-copy price.");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("quotation changed");
  expect(note.value).toBe("Check the 2,000-copy price.");
  expect(button("Send change request").disabled).toBe(false);
  await act(() => button("Send change request").click());
  expect(container.textContent).toContain("You requested changes");
  expect(container.querySelector("textarea")).toBeNull();
});

it("offers no decisions on another reviewer's task without claiming the round is closed", async () => {
  await act(() => root.render(<ApprovalDecisionControls {...props} canRespond={false} />));
  expect(container.querySelector("button")).toBeNull();
  expect(container.textContent).toContain("another teammate");
  expect(container.textContent).not.toContain("no longer accepting");
  expect(mocks.approve).not.toHaveBeenCalled();
  expect(mocks.changes).not.toHaveBeenCalled();
});
