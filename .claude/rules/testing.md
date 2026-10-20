---
paths:
  - "app/**"
  - "components/**"
  - "hooks/**"
  - "lib/**"
  - "test/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "vitest.config.*"
description: "Write and retain tests whose production value justifies their cost"
---

# Test value

Before adding a test, name the incorrect production outcome it would catch and
why that consequence warrants ongoing execution and maintenance. A distinct
input, cheap runtime, changed file, or extra covered line is insufficient by
itself. There is no required test count per change.

## Choose useful coverage

- Reuse or update an existing scenario before adding another. Copy, styling,
  documentation, and mechanically equivalent changes do not require new tests
  on their own. Use code inspection, type checking, lint, or visual review when
  those checks answer the actual risk.
- Prioritize authentication, permission and private-conversation boundaries,
  financial calculations and accounting, data integrity, successful writes,
  explicit-send boundaries, and failure recovery. Retain cases that prove
  rollback, retry, idempotency, secret redaction, or preservation of user work.
- Prefer observable results: persisted changes, returned data, rendered output,
  and immediate, success, and failure behavior for mutations. Follow the action
  feedback requirements in `AGENTS.md`; adding this policy does not relax them.
- Keep authentication and permission checks for each independently implemented
  handler or action. Similar assertions across separate authorization
  boundaries are useful coverage.
- Test shared pure logic in its own suite. Callers need representative checks
  that they actually apply it, especially for permission filters, financial
  accounting, redaction, and destructive writes. Do not repeat every helper
  input through each caller or re-export. For security rules and classifiers,
  retain both harmful-input rejection and valid-input preservation.
- Choose representative cases for secondary features. Keep separate cases for
  consequential differences in roles, races, state transitions, or data
  formats. Avoid exhaustive default, display, filter, or low-risk validation
  permutations that add little protection.
- In rejection tests, keep unrelated preconditions valid so an earlier failure
  cannot conceal a missing guard.

## Avoid tests that mirror the implementation

- Do not test a fixture's own values, trivial passthroughs, exact JSX spelling,
  CSS classes, or copy inventories. Avoid status-code checklists and generic
  mocked exceptions whose only assertion is an error response.
- Prefer executable behavior tests over source-text or generated-SQL spelling
  checks. A narrow structural check is acceptable when it is the only practical
  guard for a consequential boundary, such as authorization or private data.
  State its limits; it does not prove runtime or browser behavior.
- Do not build a custom React hook simulator or a large mock harness just to
  verify a small implementation detail. Use existing test infrastructure or a
  more direct behavior check.
- When assertions share the same expensive render, query, or export scenario,
  perform that setup once. Use separate runs for meaningfully different inputs
  or lifecycle behavior, rather than separate fields of the same result.
- Run ESLint, TypeScript, and build checks directly when needed. Do not launch
  a full linter from a unit test to verify lint configuration, or count an
  informational report as a passing test. Retain executable checks that protect
  compiler, build, or process-isolation behavior.

## Prune deliberately

When test cleanup is in scope, remove low-value display inventories, trivial
defaults, and repetitive low-risk cases. Describe the coverage being given up
and why the tradeoff is acceptable; not every deletion is redundant coverage.
Keep distinct consequential failure modes. Do not reduce reported counts by
hiding cases in loops, adding skips, or weakening assertions. Keep cleanup
within the requested scope.

## Verify in proportion to the change

- Use the existing Vitest configuration: tests currently live under
  `lib/**/*.test.ts`, `components/**/*.test.tsx`, and explicit root includes.
  Confirm a new file is discovered rather than assuming tests under `app/` run.
- Start with the affected test file or suite, for example
  `pnpm test lib/chat/navigation.test.ts`. Broaden or repeat checks only when
  changed dependencies, new edits, failures, or unresolved risks justify it.
- Use the browser-review threshold in `AGENTS.md`. Do not start a browser just
  because a change touches a UI file.
- For documentation-only guidance changes, review the wording and links and
  run `git diff --check`; application tests, type checking, builds, and browser
  runs are unnecessary unless executable behavior also changes.
- Keep the full pre-PR checks in `CONTRIBUTING.md` and existing CI gates. Do not
  skip failing tests or disable checks to satisfy this policy. Report what was
  checked and any remaining verification limits.
