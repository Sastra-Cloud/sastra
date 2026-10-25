import { describe, expect, it, vi } from "vitest";
import { APP_UPDATE_MESSAGE, createDeploymentGuard, isAppUpdateError } from "./deployment-guard";
import { thrownMutationMessage } from "@/lib/actions/result";

const origin = "https://workspace.example";
const action = { method: "POST", headers: { "Next-Action": "build-specific-id" }, body: "[]" };
const version = (id = "build-a") => Response.json({ id });

function setup(fetch = vi.fn<typeof globalThis.fetch>()) {
  const onUpdate = vi.fn();
  return { fetch, onUpdate, guard: createDeploymentGuard({ fetch, origin, loadedVersion: "build-a", onUpdate }) };
}

// Production risks: duplicate sends/payments, lost optimistic edits, and a stale
// resumed PWA accepting the new server's version as its own baseline.
describe("deployment boundary for all Server Actions", () => {
  it("tracks a current-build action until it settles and sends its original arguments once", async () => {
    let settle!: (response: Response) => void;
    const post = new Promise<Response>((resolve) => { settle = resolve; });
    const { fetch, guard, onUpdate } = setup();
    fetch.mockResolvedValueOnce(version()).mockReturnValueOnce(post);
    const result = guard.fetch("/tasks", action);
    expect(guard.hasPendingMutations()).toBe(true);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    settle(Response.json({ saved: true }));
    expect(await (await result).json()).toEqual({ saved: true });
    expect(fetch).toHaveBeenLastCalledWith("/tasks", action);
    expect(guard.hasPendingMutations()).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("rejects concurrent actions before any POST when the very first check finds a newer build", async () => {
    const { fetch, guard, onUpdate } = setup();
    fetch.mockResolvedValue(version("build-b"));
    const results = await Promise.allSettled([
      guard.fetch("/tasks", action),
      guard.fetch("/settings/profile", action),
      guard.fetch("/projects/book/budget", action),
    ]);
    expect(results.every((result) => result.status === "rejected" && isAppUpdateError(result.reason))).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({
      cache: "no-store", redirect: "error", headers: { "x-deployment-id": "build-a" },
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(guard.hasPendingMutations()).toBe(false);
    await expect(guard.fetch("/settings/team", action)).rejects.toThrow(APP_UPDATE_MESSAGE);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles the deploy-between-check-and-submit race without exposing an action ID or replaying", async () => {
    const { fetch, guard, onUpdate } = setup();
    fetch.mockResolvedValueOnce(version()).mockResolvedValueOnce(new Response("Server action not found", {
      status: 404, headers: { "x-nextjs-action-not-found": "1" },
    }));
    await expect(guard.fetch("/correspondence", action)).rejects.toThrow(APP_UPDATE_MESSAGE);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(guard.hasPendingMutations()).toBe(false);
  });

  it("never retries an uncertain response, including financial and explicit-send writes", async () => {
    const failure = new TypeError("connection closed after commit");
    const { fetch, guard, onUpdate } = setup();
    fetch.mockResolvedValueOnce(version()).mockRejectedValueOnce(failure);
    await expect(guard.fetch("/projects/book/print", action)).rejects.toBe(failure);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(guard.hasPendingMutations()).toBe(false);
  });

  it("does not treat an unavailable version check as proof of skew or break stable API mutations", async () => {
    const { fetch, guard, onUpdate } = setup();
    fetch.mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(Response.json({ ok: true }));
    expect((await guard.fetch("/settings/profile", action)).ok).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(version("build-b"));
    expect(await guard.check()).toBe(true);
    const stable = { method: "POST", body: "{}" };
    fetch.mockResolvedValueOnce(Response.json({ ok: true }));
    expect((await guard.fetch("/api/chat/channels", stable)).ok).toBe(true);
    expect(fetch).toHaveBeenLastCalledWith("/api/chat/channels", stable);
  });

  it("leaves unrelated requests alone and honors cancellation before a deferred action can be sent", async () => {
    const { fetch, guard } = setup();
    fetch.mockResolvedValue(Response.json({ ok: true }));
    const external = new Request("https://uploads.example/file", action);
    await guard.fetch(external);
    await guard.fetch("/api/version");
    expect(fetch.mock.calls.map(([input]) => input)).toEqual([external, "/api/version"]);
    fetch.mockResolvedValueOnce(version());
    const controller = new AbortController();
    controller.abort();
    await expect(guard.fetch(new Request(`${origin}/tasks`, { ...action, signal: controller.signal }))).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("redacts raw framework errors at the shared optimistic-action feedback boundary", () => {
    expect(thrownMutationMessage(new Error('Server Action "private-id" was not found on the server.'), "Failed")).toBe(APP_UPDATE_MESSAGE);
    expect(thrownMutationMessage(new Error("Check this field"), "Failed")).toBe("Check this field");
  });
});
