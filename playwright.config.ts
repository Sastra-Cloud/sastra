import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

// Started by `pnpm test:browser` (scripts/browser-tests.mjs), which owns the
// throwaway database, the production server, and the fixture. These variables
// are set only by that runner.
const baseURL = process.env.SASTRA_BROWSER_BASE_URL ?? "http://127.0.0.1:0";
const state = process.env.SASTRA_BROWSER_STATE ?? "test-results";

// A phone with the keyboard open leaves roughly this much room.
const shortPhone = { width: 390, height: 520 };

export default defineConfig({
  testDir: "test/browser",
  testMatch: "**/*.spec.ts",
  globalSetup: "./test/browser/global-setup.ts",
  outputDir: join(state, "results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Behavior assertions wait on observable state; this only bounds a hang.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL,
    // The runner's throwaway certificate is self-signed.
    ignoreHTTPSErrors: true,
    // The app registers a service worker. Requests it handles bypass the
    // scenarios' network interception (unreliably, per browser), and none of
    // these scenarios is about offline behavior.
    serviceWorkers: "block",
    storageState: join(state, "auth.json"),
    trace: "off",
    screenshot: "off",
    video: "off",
    // Reduced motion keeps list and scroll geometry from depending on easing.
    reducedMotion: "reduce",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "chromium-phone", use: { ...devices["Pixel 7"], viewport: shortPhone } },
    { name: "webkit-phone", use: { ...devices["iPhone 14"], viewport: shortPhone } },
  ],
});
