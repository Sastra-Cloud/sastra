import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

// Protect the deploy gate: compiler or bundler failures must never yield a
// successful build, including errors discovered in the final route validators.
const fixtures: string[] = [];
afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function build(extraEnv: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sastra-build-gate-"));
  fixtures.push(directory);
  for (const name of ["scripts", "node_modules/next/dist/bin", "node_modules/tsrs/bin"]) {
    mkdirSync(join(directory, name), { recursive: true });
  }
  copyFileSync(new URL("../scripts/build.mjs", import.meta.url), join(directory, "scripts/build.mjs"));
  writeFileSync(join(directory, "node_modules/tsrs/package.json"), JSON.stringify({ bin: { tsrs: "bin/tsrs" } }));
  const log = `
    const fs = require("node:fs");
    const record = (step) => fs.appendFileSync("steps.jsonl", JSON.stringify({
      step, checked: process.env.SASTRA_TSRS_CHECKED === "1", args: process.argv.slice(2),
    }) + "\\n");
  `;
  writeFileSync(join(directory, "node_modules/next/dist/bin/next"), `${log}
    record("next:" + process.argv[2]);
    if (process.argv[2] === "build") {
      if (process.env.FAIL_BUILD) process.exit(7);
      fs.writeFileSync("generated-route-types", "generated");
    }
  `);
  writeFileSync(join(directory, "node_modules/tsrs/bin/tsrs"), `${log}
    const phase = fs.existsSync("generated-route-types") ? "post" : "pre";
    record("tsrs:" + phase);
    if (process.env.FAIL_CHECK === phase) process.exit(2);
  `);
  const result = spawnSync(process.execPath, [join(directory, "scripts/build.mjs"), "--webpack"], {
    cwd: directory,
    env: { ...process.env, FAIL_BUILD: "", FAIL_CHECK: "", ...extraEnv, SASTRA_TSRS_CHECKED: "1" },
    encoding: "utf8",
  });
  const steps = readFileSync(join(directory, "steps.jsonl"), "utf8")
    .trim().split("\n").map((line) => JSON.parse(line) as { step: string; checked: boolean; args: string[] });
  return { result, steps };
}

it("checks types before and after bundling and scopes the checked marker to the bundler", () => {
  const { result, steps } = build();
  expect(result.status, result.stderr).toBe(0);
  expect(steps.map(({ step }) => step)).toEqual(["next:typegen", "tsrs:pre", "next:build", "tsrs:post"]);
  expect(steps.map(({ checked }) => checked)).toEqual([false, false, true, false]);
  expect(steps[2].args).toEqual(["build", ".", "--webpack"]);
});

it("stops before bundling when tsrs reports a type error", () => {
  const { result, steps } = build({ FAIL_CHECK: "pre" });
  expect(result.status).toBe(2);
  expect(steps.map(({ step }) => step)).toEqual(["next:typegen", "tsrs:pre"]);
});

it("fails the build when tsrs rejects the final generated route types", () => {
  const { result, steps } = build({ FAIL_CHECK: "post" });
  expect(result.status).toBe(2);
  expect(steps.at(-1)?.step).toBe("tsrs:post");
});

it("preserves a bundler failure instead of replacing it with a successful final check", () => {
  const { result, steps } = build({ FAIL_BUILD: "1" });
  expect(result.status).toBe(7);
  expect(steps.at(-1)?.step).toBe("next:build");
});
