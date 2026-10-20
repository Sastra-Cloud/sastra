// TypeScript 7 provides the native compiler CLI, but these tools still need the
// TypeScript 6 JavaScript API. Keep that API private to the tools so `tsc` and
// Next.js resolve the TypeScript 7 compiler from the project root.
const compilerApiConsumers = new Set([
  "cosmiconfig",
  "eslint-config-next",
  "ts-api-utils",
  "typescript-eslint",
]);

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (
        pkg.peerDependencies?.typescript &&
        (pkg.name.startsWith("@typescript-eslint/") ||
          compilerApiConsumers.has(pkg.name))
      ) {
        pkg.dependencies = {
          ...pkg.dependencies,
          typescript: "npm:@typescript/typescript6@6.0.2",
        };
        delete pkg.peerDependencies.typescript;
        if (pkg.peerDependenciesMeta) {
          delete pkg.peerDependenciesMeta.typescript;
        }
      }
      return pkg;
    },
  },
};
