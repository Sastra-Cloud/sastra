// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn(), saved: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/lib/print/estimate-intake-actions", () => ({ createPrintEstimateFromText: m.read }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { PrintEstimateIntake } from "./print-estimate-intake";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

// A failed AI read must preserve a long pasted email and the retry identity;
// closing the optional form must not discard the user's source text either.
it("shows real progress, prevents duplicate reads, and preserves pasted input through failure and closing", async () => {
  let finish!: (result: unknown) => void;
  m.read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const render = (open: boolean) => root.render(<PrintEstimateIntake id="intake" open={open} projectId="project" contacts={[]} onSaved={m.saved} />);
  await act(() => render(true));
  const text = container.querySelector("textarea")!;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(text, "1000 cps @ USD 1.36 per cpy");
    text.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  await act(() => submit.click());
  expect(submit.disabled).toBe(true); expect(submit.getAttribute("aria-busy")).toBe("true");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("Reading prices");
  await act(() => submit.click()); expect(m.read).toHaveBeenCalledTimes(1);
  const firstInput = m.read.mock.calls[0][1];
  await act(() => finish({ error: "Try the quote again." }));
  expect(text.value).toContain("1000 cps"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Try the quote again");
  await act(() => render(false)); await act(() => render(true));
  expect(container.querySelector("textarea")).toBe(text);
  expect(text.value).toContain("1000 cps");
  await act(() => submit.click());
  expect(m.read.mock.calls[1][1]).toEqual(firstInput);
  expect(firstInput.contactId).toBeNull();
  await act(() => finish({ runId: "run", count: 3 }));
  expect(m.saved).toHaveBeenCalledTimes(1); expect(m.refresh).toHaveBeenCalledTimes(1); expect(text.value).toBe("");
});
