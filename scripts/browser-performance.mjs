// Informational production-build performance report:  pnpm test:browser:performance
//
// Loads the dashboard, one project, and one chat in Chromium against a
// throwaway database and fixture (see docs/browser-verification.md), then
// prints what the browser measured. It sets no pass/fail threshold: absolute
// timings depend on the machine, so numbers are for comparing two runs of this
// command on the same machine, not for gating a change.
//
//   SASTRA_PERFORMANCE_RUNS=5 pnpm test:browser:performance
//   SASTRA_BROWSER_REPORT_DIR=/path pnpm test:browser:performance
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, request } from "@playwright/test";

import { startStack } from "./browser-tests-lib.mjs";

const RUNS = Math.max(1, Number(process.env.SASTRA_PERFORMANCE_RUNS ?? 3));
const reportDir = resolve(process.env.SASTRA_BROWSER_REPORT_DIR ?? "browser-performance-report");

// Chrome DevTools' "Slow 4G" and a 4x slower CPU.
const PROFILES = {
  unthrottled: null,
  "throttled (slow 4G, 4x CPU)": {
    latency: 150,
    download: (1.6 * 1024 * 1024) / 8,
    upload: (750 * 1024) / 8,
    cpu: 4,
  },
};
const MARKERS = {
  dashboard: ["dashboard-tasks-visible", "dashboard-tasks-ready"],
  project: [],
  chat: ["chat-messages-visible", "chat-composer-ready"],
};

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Runs inside the page after it has settled. Only standard browser entries are read. */
async function collect() {
  // LCP is only available through an observer, which replays buffered entries.
  const lcpTime = await new Promise((resolve) => {
    let last = null;
    try {
      const observer = new PerformanceObserver((list) => { last = list.getEntries().at(-1) ?? last; });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      setTimeout(() => { observer.disconnect(); resolve(last ? last.startTime : null); }, 150);
    } catch {
      resolve(null);
    }
  });
  const navigation = performance.getEntriesByType("navigation")[0];
  const paint = Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, e.startTime]));
  const resources = performance.getEntriesByType("resource");
  const sum = (key) => resources.reduce((total, e) => total + (e[key] || 0), 0) + (navigation?.[key] || 0);
  return {
    ttfb: navigation ? navigation.responseStart : null,
    fcp: paint["first-contentful-paint"] ?? null,
    lcp: lcpTime,
    load: navigation ? navigation.loadEventEnd : null,
    requests: resources.length + 1,
    transferBytes: sum("transferSize"),
    decodedBytes: sum("decodedBodySize"),
    scriptBytes: resources
      .filter((e) => e.initiatorType === "script" || e.name.endsWith(".js"))
      .reduce((total, e) => total + (e.transferSize || 0), 0),
    markers: Object.fromEntries(
      performance
        .getEntriesByType("measure")
        .filter((e) => e.name.startsWith("sastra:"))
        .map((e) => [e.name.slice(7), e.duration])
    ),
  };
}

async function throttle(page, profile) {
  if (!profile) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: profile.latency,
    downloadThroughput: profile.download,
    uploadThroughput: profile.upload,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
}

async function measure(page, url, markers) {
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  if (markers.length > 0) {
    // Ready markers are always written; "visible" needs Element Timing (Chromium).
    await page
      .waitForFunction(
        (names) => names.every((n) => performance.getEntriesByName(`sastra:${n}`).length > 0),
        markers,
        { timeout: 60_000 }
      )
      .catch(() => {});
  }
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  return page.evaluate(collect);
}

// Plain HTTP on loopback: a TLS proxy would add noise to the numbers.
const stack = await startStack({ build: true, tls: false });
let exitCode = 0;
try {
  const fixtures = JSON.parse(readFileSync(join(stack.state, "fixtures.json"), "utf8"));
  const routes = {
    dashboard: "/dashboard",
    project: `/projects/${fixtures.projectSlug}`,
    chat: `/chat/${fixtures.generalChannelId}`,
  };
  const api = await request.newContext({ baseURL: stack.baseUrl, extraHTTPHeaders: { origin: stack.baseUrl } });
  const signedIn = await api.post("/api/auth/sign-in/email", { data: { email: stack.email, password: stack.password } });
  if (!signedIn.ok()) throw new Error(`Fixture sign-in failed (HTTP ${signedIn.status()}).`);
  const storageState = await api.storageState();
  await api.dispose();

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [profileName, profile] of Object.entries(PROFILES)) {
      for (const [routeName, path] of Object.entries(routes)) {
        for (const cache of ["cold", "warm"]) {
          const runs = [];
          // Cold: a new context per run, so no HTTP cache. Warm: one context,
          // measured on a repeat visit after an unmeasured first load.
          const warmContext = cache === "warm" ? await browser.newContext({ storageState, viewport: { width: 1280, height: 800 } }) : null;
          for (let run = 0; run < RUNS; run++) {
            const context = warmContext ?? (await browser.newContext({ storageState, viewport: { width: 1280, height: 800 } }));
            const page = await context.newPage();
            await throttle(page, profile);
            if (cache === "warm") await measure(page, `${stack.baseUrl}${path}`, MARKERS[routeName]);
            runs.push(await measure(page, `${stack.baseUrl}${path}`, MARKERS[routeName]));
            await page.close();
            if (!warmContext) await context.close();
          }
          await warmContext?.close();
          results.push({ profile: profileName, route: routeName, cache, runs });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const lines = [];
  const ms = (v) => (v === null || v === undefined ? "n/a" : `${Math.round(v)}`);
  const kb = (v) => `${Math.round(v / 1024)}`;
  lines.push(`# Browser performance report (informational, ${RUNS} runs per row, medians)`);
  lines.push("");
  lines.push("Chromium against a production build and a throwaway fixture on this machine.");
  lines.push("Compare only runs of this command on the same machine. There is no pass/fail threshold.");
  lines.push("`visible` uses Element Timing and is n/a where the browser did not report it.");
  lines.push("`ready` is when React has attached handlers. Times are ms from navigation start; sizes are KB.");
  lines.push("");
  lines.push("| network and CPU | page | cache | TTFB | FCP | LCP | visible | ready | requests | transferred KB | decoded KB |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const row of results) {
    const m = (pick) => median(row.runs.map(pick).filter((v) => typeof v === "number"));
    const visibleName = MARKERS[row.route].find((n) => n.endsWith("visible"));
    const readyName = MARKERS[row.route].find((n) => n.endsWith("ready"));
    lines.push(
      `| ${row.profile} | ${row.route} | ${row.cache} | ${ms(m((r) => r.ttfb))} | ${ms(m((r) => r.fcp))} | ${ms(m((r) => r.lcp))} | ` +
        `${visibleName ? ms(m((r) => r.markers[visibleName])) : "-"} | ${readyName ? ms(m((r) => r.markers[readyName])) : "-"} | ` +
        `${ms(m((r) => r.requests))} | ${kb(m((r) => r.transferBytes) ?? 0)} | ${kb(m((r) => r.decodedBytes) ?? 0)} |`
    );
  }
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "performance.json"), JSON.stringify({ runs: RUNS, results }, null, 2));
  writeFileSync(join(reportDir, "performance.md"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
  console.log(`\nSaved to ${reportDir}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await stack.cleanup();
}
process.exit(exitCode);
