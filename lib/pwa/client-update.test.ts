import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

it("keeps reloads explicit, waits for running API writes, and lets a failed draft save veto refresh", async () => {
  let finish!: (response: Response) => void;
  const fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
  const reload = vi.fn();
  const browser = Object.assign(new EventTarget(), { fetch, location: { origin: "https://workspace.example", reload } });
  vi.stubGlobal("window", browser);
  vi.stubEnv("NEXT_PUBLIC_SASTRA_DEPLOYMENT_ID", "dev");
  const { installDeploymentGuard, reloadForAppUpdate, BEFORE_APP_REFRESH_EVENT } = await import("./client-update");
  installDeploymentGuard();
  const sending = browser.fetch("/api/email/send", { method: "POST" });
  expect(reloadForAppUpdate()).toBe(false);
  expect(reload).not.toHaveBeenCalled();
  finish(Response.json({ ok: true }));
  await sending;
  const veto = (event: Event) => event.preventDefault();
  browser.addEventListener(BEFORE_APP_REFRESH_EVENT, veto);
  expect(reloadForAppUpdate()).toBe(false);
  expect(reload).not.toHaveBeenCalled();
  browser.removeEventListener(BEFORE_APP_REFRESH_EVENT, veto);
  expect(reloadForAppUpdate()).toBe(true);
  expect(reload).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
});
