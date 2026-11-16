// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn(), refresh: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/lib/workspace/actions", () => ({ updateWorkspaceSettings: mocks.update, setWorkspaceLogo: vi.fn(), removeWorkspaceLogo: vi.fn() }));
vi.mock("@/lib/files/upload-client", () => ({ uploadFile: vi.fn() }));

import { WorkspaceSettingsForm } from "./workspace-settings-form";
import type { WorkspaceSettings } from "@/lib/workspace/queries";

const settings = {
  orgName: "Ministry", orgAliases: [], internalEmailDomains: [], accentColor: "#B65C3A", logoFileId: null,
  legalName: "Legal ministry", sourceLanguage: "English", targetLanguage: "Khmer", timezone: "Asia/Phnom_Penh",
  defaultCurrency: "USD", defaultCcEmails: [], invoicePaymentDetails: null, workDays: [1, 2, 3, 4, 5],
  workHoursStart: 480, workHoursEnd: 960, weeklyDigestDay: 1, weeklyDigestTime: "09:00", defaultFundingDeductionBps: 1300,
} as unknown as WorkspaceSettings;

// One save must include every card, block duplicate submissions, and keep drafts on failure.
it("uses one save for branding, defaults, and numbering, preserving edits and focusing genuine errors before retry", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  let resolve!: (result: object) => void;
  mocks.update.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  try {
    await act(() => root.render(<WorkspaceSettingsForm settings={settings} sequence={{ prefix: "INV-", nextNumber: 12, padding: 4 }} />));
    const form = container.querySelector("form")!;
    const submit = () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    const edit = async (name: string, value: string) => act(() => {
      const input = form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("Save numbering");
    await edit("orgName", "Updated ministry");
    await edit("legalName", "Updated legal name");
    await edit("preparedByNote", "Prepared by the team");
    await act(() => { submit(); submit(); });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update.mock.calls[0]).toEqual([expect.objectContaining({ orgName: "Updated ministry", legalName: "Updated legal name", sourceLanguage: "English", targetLanguage: "Khmer", preparedByNote: "Prepared by the team", invoiceSequence: undefined })]);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(() => resolve({ error: "Check the highlighted settings.", fieldErrors: { targetLanguage: "Enter the primary target language." } }));
    expect(document.activeElement).toBe(form.querySelector('[name="targetLanguage"]'));
    expect(form.querySelector<HTMLInputElement>('[name="orgName"]')!.value).toBe("Updated ministry");
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("primary target language");
    expect(mocks.refresh).not.toHaveBeenCalled();
    await edit("invoiceNextNumber", "20");
    await act(() => { submit(); });
    expect(mocks.update.mock.calls[1][0]).toMatchObject({ invoiceSequence: { prefix: "INV-", nextNumber: 20, padding: 4, previousNextNumber: 12 } });
    await act(() => resolve({}));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledWith("Workspace settings saved");
    expect(form.querySelector('[role="alert"]')).toBeNull();
  } finally { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
});
