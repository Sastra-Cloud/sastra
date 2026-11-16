// Shared by the browser regression runner and the performance report.
// Everything here is about safety first: the suites create, fill, and drop a
// throwaway database, so they refuse to touch anything that is not obviously one.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import postgres from "postgres";

const require = createRequire(import.meta.url);
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DISPOSABLE_NAME = /^sastra_browser_[a-z0-9]{8,24}$/;
const ENV_FILES = [".env", ".env.local", ".env.production", ".env.production.local"];

export function isLoopbackHost(hostname) {
  return LOOPBACK.has(hostname);
}

/**
 * Throws unless `databaseUrl` is a throwaway database on this machine and the
 * caller explicitly said so. Never echoes the URL: it contains credentials.
 */
export function assertDisposableTarget(databaseUrl, env = process.env) {
  if (env.SASTRA_DISPOSABLE_DATABASE !== "true") {
    throw new Error("Refusing to run: SASTRA_DISPOSABLE_DATABASE=true is not set.");
  }
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Refusing to run: the database URL is not valid.");
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new Error("Refusing to run: the database is not on this machine (loopback only).");
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!DISPOSABLE_NAME.test(name)) {
    throw new Error("Refusing to run: the database name is not a sastra_browser_* throwaway name.");
  }
}

/** The server that will host the throwaway database, never the app's own database name. */
export function resolveServerUrl(env = process.env) {
  const raw = env.SASTRA_BROWSER_DATABASE_SERVER_URL;
  if (!raw) {
    throw new Error(
      "Set SASTRA_BROWSER_DATABASE_SERVER_URL to a local Postgres 18 (pgvector) server that can create databases."
    );
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Refusing to run: the Postgres server URL is not valid.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !isLoopbackHost(url.hostname)) {
    throw new Error("Refusing to run: the Postgres server is not on this machine (loopback only).");
  }
  url.pathname = "/postgres";
  url.search = "";
  return url.toString();
}

/** next start would read these and pick up real credentials; refuse rather than guess. */
export function assertNoLocalEnvFiles(cwd = process.cwd()) {
  const present = ENV_FILES.filter((file) => existsSync(join(cwd, file)));
  if (present.length > 0) {
    throw new Error(
      `Refusing to run with ${present.join(", ")} present: the test server would load real settings. ` +
        "Run the suite from a clean checkout without local environment files."
    );
  }
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function createDisposableDatabase(serverUrl) {
  const name = `sastra_browser_${randomBytes(6).toString("hex")}`;
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  assertDisposableTarget(url.toString());
  const admin = postgres(serverUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end({ timeout: 5 });
  }
  return { name, url: url.toString() };
}

export async function dropDisposableDatabase(serverUrl, name) {
  if (!DISPOSABLE_NAME.test(name)) return;
  const admin = postgres(serverUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    await admin.unsafe(`drop database if exists "${name}" with (force)`);
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/** A minimal environment: nothing from the caller's shell (tokens, keys) reaches the test server. */
export function cleanEnv(extra) {
  const base = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG", "TERM", "CI"]) {
    if (process.env[key]) base[key] = process.env[key];
  }
  return { ...base, ...extra };
}

export function runSync(command, args, env, label) {
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status ?? "signal"}).`);
}

export function makeTempDir(prefix = "sastra-browser-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function removeTempDir(path) {
  // rmSync does not follow symlinks; recursion removes the link itself.
  rmSync(path, { recursive: true, force: true });
}

export async function waitForReady(baseUrl, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("The test server exited before it was ready.");
    try {
      const response = await fetch(`${baseUrl}/api/ready`);
      if (response.ok) return;
    } catch {
      /* not listening yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The test server did not become ready in time.");
}

/**
 * The app sends `upgrade-insecure-requests` and HSTS, as it does in production,
 * so WebKit will only talk to it over HTTPS. This puts a throwaway self-signed
 * certificate (valid one day, kept in the run's temp directory) in front of it.
 */
export function createTlsProxy({ targetPort, listenPort, directory }) {
  const key = join(directory, "tls-key.pem");
  const cert = join(directory, "tls-cert.pem");
  runSync(
    "openssl",
    ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1",
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost"],
    cleanEnv({}),
    "Self-signed certificate"
  );
  const proxy = https.createServer(
    { key: readFileSync(key), cert: readFileSync(cert) },
    (request, response) => {
      const upstream = http.request(
        {
          host: "127.0.0.1",
          port: targetPort,
          method: request.method,
          path: request.url,
          headers: { ...request.headers, "x-forwarded-proto": "https" },
          // A new connection each time: a pooled one the server already closed would hang a POST.
          agent: false,
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          // Streamed responses (React Server Components) must pass through unbuffered.
          upstreamResponse.pipe(response);
        }
      );
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    }
  );
  return new Promise((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(listenPort, "127.0.0.1", () => resolve(proxy));
  });
}

export function startServer(env, port) {
  const next = require.resolve("next/dist/bin/next");
  return spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(port)], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });
}

export async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 8000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Create the throwaway database, migrate and bootstrap it, optionally build,
 * start the production server, and provision the fixture. Returns what a
 * suite needs and a `cleanup()` that always drops everything it made.
 */
export async function startStack({ build = true, tls = true } = {}) {
  assertNoLocalEnvFiles();
  const serverUrl = resolveServerUrl();
  const state = makeTempDir();
  let database = null;
  let server = null;
  let proxy = null;
  const cleanup = async () => {
    await new Promise((resolve) => (proxy ? proxy.close(() => resolve()) : resolve()));
    await stopServer(server);
    if (database) await dropDisposableDatabase(serverUrl, database.name).catch(() => {});
    removeTempDir(state);
  };
  try {
    database = await createDisposableDatabase(serverUrl);
    const port = await freePort();
    const internalUrl = `http://127.0.0.1:${port}`;
    const publicPort = tls ? await freePort() : port;
    const baseUrl = `${tls ? "https" : "http"}://127.0.0.1:${publicPort}`;
    const email = `browser-${randomToken(6).toLowerCase()}@example.test`;
    const password = randomToken(18);
    const baseEnv = {
      DATABASE_URL: database.url,
      SASTRA_DISPOSABLE_DATABASE: "true",
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: randomToken(32),
      AUTH_PROVISIONING_SECRET: randomToken(32),
      ENABLE_INITIAL_ADMIN_BOOTSTRAP: "true",
      MIGRATE_ON_START: "false",
      SASTRA_PERFORMANCE_MONITORING: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    const env = cleanEnv(baseEnv);
    runSync(process.execPath, ["scripts/migrate.mjs"], env, "Database migration");
    runSync(process.execPath, ["scripts/bootstrap-workspace.mjs"], env, "Workspace bootstrap");
    if (build) {
      if (process.env.SASTRA_BROWSER_REUSE_BUILD === "true" && existsSync(".next/BUILD_ID")) {
        console.log("Reusing the existing production build.");
      } else {
        runSync(process.execPath, ["scripts/build.mjs"], env, "Production build");
      }
    }
    server = startServer(env, port);
    await waitForReady(internalUrl, server);
    if (tls) proxy = await createTlsProxy({ targetPort: port, listenPort: publicPort, directory: state });
    const provisionEnv = cleanEnv({
      ...baseEnv,
      // Provisioning talks to the app directly but presents the public origin.
      SASTRA_BROWSER_BASE_URL: internalUrl,
      SASTRA_BROWSER_ORIGIN: baseUrl,
      SASTRA_BROWSER_EMAIL: email,
      SASTRA_BROWSER_PASSWORD: password,
      SASTRA_BROWSER_STATE: state,
    });
    runSync(
      process.execPath,
      [require.resolve("tsx/cli"), "test/browser/provision.ts"],
      provisionEnv,
      "Fixture provisioning"
    );
    return { baseUrl, email, password, state, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
