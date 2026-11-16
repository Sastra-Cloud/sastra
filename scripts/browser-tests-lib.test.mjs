import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertDisposableTarget, assertNoLocalEnvFiles, resolveServerUrl } from "./browser-tests-lib.mjs";

const ok = { SASTRA_DISPOSABLE_DATABASE: "true" };
const url = (host, name) => `postgres://user:secret@${host}:5432/${name}`;

test("accepts only a flagged, loopback, sastra_browser_* throwaway database", () => {
  assertDisposableTarget(url("127.0.0.1", "sastra_browser_0123456789ab"), ok);
  assertDisposableTarget(url("localhost", "sastra_browser_0123456789ab"), ok);
});

test("refuses the dev database, remote hosts, a missing flag, and bad URLs", () => {
  for (const [target, env] of [
    [url("127.0.0.1", "sastra"), ok],
    [url("db.internal.example", "sastra_browser_0123456789ab"), ok],
    [url("127.0.0.1", "sastra_browser_0123456789ab"), {}],
    [url("127.0.0.1", "sastra_browser_0123456789ab"), { SASTRA_DISPOSABLE_DATABASE: "yes" }],
    [url("127.0.0.1", "sastra_browser_x; drop database sastra"), ok],
    ["not a url", ok],
  ]) {
    assert.throws(() => assertDisposableTarget(target, env), /Refusing to run/);
  }
});

test("never puts the credentials in an error", () => {
  try {
    assertDisposableTarget(url("db.internal.example", "sastra"), ok);
    assert.fail("expected a refusal");
  } catch (error) {
    assert.doesNotMatch(String(error.message), /secret|user:/);
  }
});

test("rejects malformed server URLs without printing their input", () => {
  assert.throws(
    () => resolveServerUrl({ SASTRA_BROWSER_DATABASE_SERVER_URL: "secret-credential" }),
    (error) => /not valid/.test(error.message) && !/secret-credential/.test(String(error))
  );
});

test("refuses local environment files so fixture runs cannot inherit real providers", () => {
  const directory = mkdtempSync(join(tmpdir(), "sastra-browser-guard-"));
  try {
    assertNoLocalEnvFiles(directory);
    writeFileSync(join(directory, ".env.production.local"), "FIXTURE_ONLY=true\n");
    assert.throws(() => assertNoLocalEnvFiles(directory), /clean checkout/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
