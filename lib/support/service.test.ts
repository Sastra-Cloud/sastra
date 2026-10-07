import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { supportRequest } from "./service";

afterEach(() => vi.unstubAllEnvs());

it("ordinary self-hosting refuses support requests without making network calls", async () => {
  for (const key of ["SASTRA_SUPPORT_URL", "SASTRA_SUPPORT_INSTANCE_ID", "SASTRA_SUPPORT_SECRET"])
    vi.stubEnv(key, "");
  const network = vi.fn<typeof fetch>();
  await expect(supportRequest({ op: "list" }, network)).rejects.toThrow("community support");
  expect(network).not.toHaveBeenCalled();
});
