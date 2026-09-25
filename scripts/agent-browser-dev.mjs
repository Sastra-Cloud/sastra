#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const AGENT_BROWSER_PACKAGE = "agent-browser@0.31.1";

for (const file of [".env", ".env.local"]) {
  try {
    if (existsSync(file) && typeof process.loadEnvFile === "function") {
      process.loadEnvFile(file);
    }
  } catch {
    // Ambient environment is enough.
  }
}

function runAgentBrowser(args, { exit = true } = {}) {
  const executable = process.env.AGENT_BROWSER_BIN || "npx";
  const prefix = process.env.AGENT_BROWSER_BIN
    ? []
    : ["-y", AGENT_BROWSER_PACKAGE];
  const result = spawnSync(executable, [...prefix, ...args], {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  const status = result.status ?? 1;
  if (exit) process.exit(status);
  return status;
}

function localLoginTarget(redirectPath) {
  const token = process.env.AGENT_BROWSER_DEV_TOKEN;
  if (!token) {
    console.error("AGENT_BROWSER_DEV_TOKEN is required for dev auto-login.");
    process.exit(1);
  }

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3243";
  const url = new URL("/api/dev/agent-login", baseUrl);
  url.searchParams.set("redirect", redirectPath || "/dashboard");
  return {
    url: url.toString(),
    headers: JSON.stringify({ "x-agent-browser-dev-token": token }),
  };
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case undefined:
  case "help":
  case "--help":
    runAgentBrowser(["--help"]);
    break;
  case "install":
    runAgentBrowser(["install", ...rest]);
    break;
  case "open":
    {
      const target = localLoginTarget(rest[0]);
      const headerStatus = runAgentBrowser(
        ["set", "headers", target.headers],
        { exit: false }
      );
      if (headerStatus !== 0) process.exit(headerStatus);
      runAgentBrowser(["--enable", "react-devtools", "open", target.url]);
    }
    break;
  case "snapshot":
    runAgentBrowser(["snapshot", "-i", ...rest]);
    break;
  case "screenshot":
    runAgentBrowser(["screenshot", ...rest]);
    break;
  default:
    runAgentBrowser([command, ...rest]);
}
