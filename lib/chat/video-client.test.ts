import { afterEach, expect, it, vi } from "vitest";
import { prepareChatVideo } from "./video-client";

afterEach(() => vi.unstubAllGlobals());

it("cancels the actual worker so a cancelled clip cannot finish or consume encoders", async () => {
  const terminate = vi.fn();
  const postMessage = vi.fn();
  vi.stubGlobal("Worker", class { terminate = terminate; postMessage = postMessage; });
  const controller = new AbortController();
  const pending = prepareChatVideo(new File(["video"], "clip.mov"), "standard", controller.signal, vi.fn());
  expect(postMessage).toHaveBeenCalledTimes(1);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(terminate).toHaveBeenCalledTimes(1);
});
