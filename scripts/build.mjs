import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const tsrsPackagePath = require.resolve("tsrs/package.json");
const tsrsPackage = JSON.parse(readFileSync(tsrsPackagePath, "utf8"));
const tsrsCli = resolve(dirname(tsrsPackagePath), tsrsPackage.bin.tsrs);
const checkerArgs = [
  "--noEmit",
  "--checkers",
  "2",
  "--tsBuildInfoFile",
  "tsconfig.tsrs.tsbuildinfo",
];

// The marker belongs only to the bundler child, after tsrs has passed.
const env = { ...process.env };
// Bound each JavaScript process; native allocations still need a builder limit.
env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --max-old-space-size=2048`.trim();
delete env.SASTRA_TSRS_CHECKED;

function run(cli, args, childEnv = env) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: "inherit",
    env: childEnv,
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(nextCli, ["typegen"]);
console.log("Checking types with tsrs...");
run(tsrsCli, checkerArgs);
// Bundle the same working directory that was checked, while forwarding flags.
run(nextCli, ["build", ".", ...process.argv.slice(2)], {
  ...env,
  SASTRA_TSRS_CHECKED: "1",
});
// Check the final generated route validators as well as the pre-build types.
console.log("Checking final build types with tsrs...");
run(tsrsCli, checkerArgs);
