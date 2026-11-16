// @vitest-environment happy-dom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), send: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn() } }));
vi.mock("@/lib/proposals/actions", () => ({
  draftMouProposal: mocks.draft,
  sendMouProposal: mocks.send,
  updateProposedCompletionDate: vi.fn(),
}));
vi.mock("@/lib/print/actions", () => ({ learnFromEmailEdit: vi.fn() }));
vi.mock("@/lib/email/draft-actions", () => ({ saveEmailDraft: vi.fn(), discardEmailDraft: vi.fn() }));
vi.mock("./completion-date-planner", () => ({ CompletionDatePlanner: () => null }));

import { ProposalPanel } from "./proposal-panel";

let container: HTMLDivElement;
let root: Root;
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

// An opaque wait can trigger duplicate AI work or leave managers unsure
// whether an external email has been sent. Failure must allow a safe retry.
it("shows drafting progress, recovers after failure, and opens a review-only composer on success", async () => {
  let finish!: (value: unknown) => void;
  mocks.draft.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const props: ComponentProps<typeof ProposalPanel> = {
    projectId: "project", projectSlug: "book", quotationId: "quote",
    partnerQuoteMode: "itemized", partnerQuoteTotal: 100, currency: "USD",
    canEdit: true, fundingEmail: "partner@example.org", approvalRequired: false,
    approvalCanSend: true, approvalGateReason: null, proposedCompletionDate: null,
    realCompletionDeadline: "2026-12-31", initialEmailDraft: null, proposals: [],
  };
  await act(() => root.render(<ProposalPanel {...props} />));
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Draft proposal"))!;
  await act(() => button.click());
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Writing your proposal email");
  await act(() => button.click());
  expect(mocks.draft).toHaveBeenCalledTimes(1);

  await act(() => finish({ error: "Could not write the email. Try again." }));
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(button.disabled).toBe(false);
  expect(mocks.error).toHaveBeenCalled();
  await act(() => button.click());
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  await act(() => finish({ subject: "Project proposal", body: "Please review the quotation.", defaultCcEmails: [] }));
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(container.querySelector<HTMLInputElement>('input[value="Project proposal"]')).not.toBeNull();
  expect([...container.querySelectorAll("textarea")].some((t) => t.value === "Please review the quotation.")).toBe(true);
  const send = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Send proposal"))!;
  expect(send.disabled).toBe(true);
  expect(mocks.send).not.toHaveBeenCalled();
});
