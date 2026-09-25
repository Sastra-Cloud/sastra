export const DEV_AGENT_LOGIN_PATH = "/api/dev/agent-login";
export const DEFAULT_AGENT_LOGIN_REDIRECT = "/dashboard";

type Env = Partial<
  Record<
    | "NODE_ENV"
    | "AGENT_BROWSER_DEV_TOKEN"
    | "AGENT_BROWSER_DEV_EMAIL"
    | "AGENT_BROWSER_DEV_PASSWORD",
    string
  >
>;

export function isDevAgentLoginPath(pathname: string, env: Env = process.env) {
  return env.NODE_ENV === "development" && pathname === DEV_AGENT_LOGIN_PATH;
}

export function hasDevAgentLoginConfig(env: Env = process.env) {
  return Boolean(
    env.AGENT_BROWSER_DEV_TOKEN &&
      env.AGENT_BROWSER_DEV_EMAIL &&
      env.AGENT_BROWSER_DEV_PASSWORD
  );
}

export function safeDevAgentRedirect(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AGENT_LOGIN_REDIRECT;
  }

  try {
    const parsed = new URL(value, "http://agent-browser.local");
    if (parsed.origin !== "http://agent-browser.local") {
      return DEFAULT_AGENT_LOGIN_REDIRECT;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AGENT_LOGIN_REDIRECT;
  }
}
