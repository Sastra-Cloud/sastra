// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { linkSocial } = vi.hoisted(() => ({ linkSocial: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { linkSocial } }));

import { GoogleDriveConnectButton } from "./google-drive-connect-button";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  linkSocial.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it("keeps a reconnect pending through the consent handoff and prevents duplicate authorization", async () => {
  let resolve!: (value: unknown) => void;
  linkSocial.mockReturnValue(new Promise((done) => { resolve = done; }));
  await act(() => root.render(<GoogleDriveConnectButton connected />));
  const button = container.querySelector("button")!;
  await act(() => { button.click(); button.click(); });
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(linkSocial).toHaveBeenCalledOnce();
  // Only per-file Drive access is requested; account selection and consent are
  // explicit so a stale grant or the wrong browser account can be corrected.
  expect(linkSocial.mock.calls[0][0]).toMatchObject({
    provider: "google",
    scopes: ["https://www.googleapis.com/auth/drive.file"],
    additionalParams: { prompt: "select_account consent", access_type: "offline" },
  });
  const failureURL = new URL(linkSocial.mock.calls[0][0].errorCallbackURL);
  expect(failureURL.pathname).toBe("/settings/profile");
  expect(failureURL.searchParams.get("drive")).toBe("error");
  await act(() => resolve({ data: { url: "https://accounts.google.com/consent", redirect: true }, error: null }));
  expect(button.disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

it.each(["response", "network"])("allows retry after an authorization start failure (%s)", async (failure) => {
  if (failure === "response") linkSocial.mockResolvedValueOnce({ error: { message: "internal details" }, data: null });
  else linkSocial.mockRejectedValueOnce(new Error("internal details"));
  linkSocial.mockResolvedValueOnce({ data: { url: "https://accounts.google.com/consent", redirect: true }, error: null });
  await act(() => root.render(<GoogleDriveConnectButton />));
  const button = container.querySelector("button")!;
  await act(() => button.click());
  expect(button.disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain("internal details");
  await act(() => button.click());
  expect(linkSocial).toHaveBeenCalledTimes(2);
  expect(button.disabled).toBe(true);
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
