// One command for the real-browser regression suite:  pnpm test:browser
//
//   pnpm test:browser                       all browsers
//   pnpm test:browser --project webkit-phone
//   SASTRA_BROWSER_REUSE_BUILD=true pnpm test:browser   skip the production build
//
// Needs a local Postgres 18 (pgvector) server that can create databases. Set
// SASTRA_BROWSER_DATABASE_SERVER_URL in a clean checkout without .env files.
// See docs/browser-verification.md.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

import { cleanEnv, startStack } from "./browser-tests-lib.mjs";

const require = createRequire(import.meta.url);
const playwright = require.resolve("@playwright/test/cli");

const stack = await startStack({ build: true });
let status = 1;
try {
  const env = cleanEnv({
    SASTRA_BROWSER_BASE_URL: stack.baseUrl,
    SASTRA_BROWSER_EMAIL: stack.email,
    SASTRA_BROWSER_PASSWORD: stack.password,
    SASTRA_BROWSER_STATE: stack.state,
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }
      : {}),
  });
  // Asynchronous on purpose: the TLS proxy in front of the app runs in this process.
  status = await new Promise((resolve) => {
    const child = spawn(process.execPath, [playwright, "test", ...process.argv.slice(2)], {
      env,
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
} finally {
  await stack.cleanup();
}
process.exit(status);
