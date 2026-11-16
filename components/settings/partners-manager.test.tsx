// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
vi.mock("@/lib/partners/actions", () => ({ createPartner: mocks.create, addPartnerContact: vi.fn(), deletePartner: vi.fn(),
  deletePartnerContact: vi.fn(), setPrimaryPartnerContact: vi.fn(), updatePartner: vi.fn(), updatePartnerContact: vi.fn() }));
import { PartnersManager } from "./partners-manager";

// A failed save must remove the optimistic card without losing the contact draft.
it("shows the pending partner immediately, restores the draft on failure, and reconciles a successful retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let reject: (error: Error) => void = () => {};
  let resolve: (value: { id: string; contactId: string }) => void = () => {};
  mocks.create.mockImplementation(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  try {
    await act(() => root.render(<PartnersManager partners={[]} contacts={[]} />));
    const labels = [...container.querySelectorAll("label")];
    const field = (label: string) => container.querySelector<HTMLInputElement>(`[id="${labels.find((row) => row.textContent === label)!.htmlFor}"]`)!;
    const fill = async (label: string, value: string) => act(() => {
      const input = field(label);
      const prototype = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await fill("Partner name", "Example Foundation");
    await fill("Billing address (optional)", "123 Main St");
    await fill("First name", "Alex");
    await fill("Email", "alex@example.org");
    const submit = async () => act(() => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await submit();
    expect(container.querySelectorAll('[aria-label="Edit partner"]')).toHaveLength(1);
    expect(field("Partner name").disabled || field("Partner name").closest("fieldset")!.disabled).toBe(true);
    await act(() => reject(new Error("Save failed")));
    expect(container.querySelectorAll('[aria-label="Edit partner"]')).toHaveLength(0);
    expect(field("Partner name").value).toBe("Example Foundation");
    expect(field("Email").value).toBe("alex@example.org");
    expect(mocks.error).toHaveBeenCalledWith("Save failed");
    await submit();
    await act(() => resolve({ id: "saved-partner", contactId: "saved-contact" }));
    expect(container.querySelectorAll('[aria-label="Edit partner"]')).toHaveLength(1);
    expect(container.textContent).toContain("123 Main St");
    expect(field("Partner name").value).toBe("");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ name: "Example Foundation", billingAddress: "123 Main St",
      contact: expect.objectContaining({ firstName: "Alex", email: "alex@example.org" }) }));
  } finally {
    await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals();
  }
});
