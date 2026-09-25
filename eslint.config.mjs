import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Purely stylistic (apostrophes/quotes in copy); content is fine as-is.
      "react/no-unescaped-entities": "off",
      // React Compiler rules (eslint-plugin-react-hooks v6) — surface the
      // intentional "sync state from props" and RSC current-date patterns used
      // across the app (incl. pre-existing components) as warnings, not hard
      // CI failures. Genuine component-in-render issues stay errors.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".impeccable/**",
    ".github/hooks/**",
    ".github/skills/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
