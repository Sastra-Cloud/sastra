import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));
afterEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

it("reports deployment identity even when Next uses a constant BUILD_ID", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ config: { deploymentId: "release-b" } }));
  const { runningVersion } = await import("./version");
  expect(runningVersion().id).toBe("release-b");
  expect(runningVersion().id).toBe("release-b");
  expect(readFileSync).toHaveBeenCalledOnce();
});

it("keeps version detection working for older images without a deployment ID", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ config: {} })).mockReturnValueOnce(" legacy-build\n");
  const { runningVersion } = await import("./version");
  expect(runningVersion().id).toBe("legacy-build");
});
