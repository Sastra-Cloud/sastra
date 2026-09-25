import "server-only";

const GITHUB_API_VERSION = "2026-03-10";
const WORKFLOW_FILE = "security-monitor.yml";

function workflowConfig() {
  const token = process.env.GITHUB_SECURITY_WORKFLOW_TOKEN?.trim();
  const repository = process.env.GITHUB_SECURITY_REPOSITORY?.trim();
  const ref = process.env.GITHUB_SECURITY_WORKFLOW_REF?.trim() || "main";
  const parts = repository?.split("/") ?? [];
  if (!token || parts.length !== 2 || parts.some((part) => !part.trim())) {
    return null;
  }
  return { token, owner: parts[0], repository: parts[1], ref };
}

export function dependencySecurityWorkflowConfigured() {
  return workflowConfig() !== null;
}

/** Ask GitHub to run the existing signed dependency-audit workflow. */
export async function dispatchDependencySecurityWorkflow(): Promise<
  { ok: true } | { ok: false; message: string }
> {
  const config = workflowConfig();
  if (!config) {
    return {
      ok: false,
      message: "Manual dependency checks are not configured in Coolify.",
    };
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
        body: JSON.stringify({ ref: config.ref }),
      }
    );
    if (response.ok) return { ok: true };
    return {
      ok: false,
      message: `GitHub could not start the security check (HTTP ${response.status}).`,
    };
  } catch {
    return {
      ok: false,
      message: "GitHub could not be reached to start the security check.",
    };
  }
}
