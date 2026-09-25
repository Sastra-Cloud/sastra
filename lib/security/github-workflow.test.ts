import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dependencySecurityWorkflowConfigured,
  dispatchDependencySecurityWorkflow,
} from "./github-workflow";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("dependency security workflow dispatch", () => {
  it("requires a token and portable owner/repository configuration", async () => {
    delete process.env.GITHUB_SECURITY_WORKFLOW_TOKEN;
    delete process.env.GITHUB_SECURITY_REPOSITORY;

    expect(dependencySecurityWorkflowConfigured()).toBe(false);
    await expect(dispatchDependencySecurityWorkflow()).resolves.toEqual({
      ok: false,
      message: "Manual dependency checks are not configured in Coolify.",
    });
  });

  it("dispatches the fixed audit workflow on the configured ref", async () => {
    process.env.GITHUB_SECURITY_WORKFLOW_TOKEN = "test-token";
    process.env.GITHUB_SECURITY_REPOSITORY = "example/sastra";
    process.env.GITHUB_SECURITY_WORKFLOW_REF = "stable";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(dispatchDependencySecurityWorkflow()).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/example/sastra/actions/workflows/security-monitor.yml/dispatches",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ref: "stable" }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "X-GitHub-Api-Version": "2026-03-10",
        }),
      })
    );
  });

  it("reports GitHub rejection without exposing response content", async () => {
    process.env.GITHUB_SECURITY_WORKFLOW_TOKEN = "test-token";
    process.env.GITHUB_SECURITY_REPOSITORY = "example/sastra";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("sensitive provider detail", { status: 403 })
      )
    );

    await expect(dispatchDependencySecurityWorkflow()).resolves.toEqual({
      ok: false,
      message: "GitHub could not start the security check (HTTP 403).",
    });
  });
});
