---
paths:
  - "app/**"
  - "components/**"
  - "next.config.ts"
  - "proxy.ts"
description: "Next.js 16 conventions and repo-specific App Router gotchas"
---

# Next.js 16

This is Next.js 16, not older App Router behavior. Before editing app code, read the relevant guide in `node_modules/next/dist/docs/`.

## Required checks

- For route handlers, confirm supported exports in `01-app/03-api-reference/03-file-conventions/route.md`.
- For dynamic segments, remember `params` is a Promise in pages, layouts, route handlers, and metadata.
- Route groups such as `app/(app)` and `app/(auth)` are organizational and do not appear in URLs.
- Quote paths containing parentheses or brackets in shell commands, for example `"app/(app)/projects/[slug]/page.tsx"`.
- Do not introduce production behavior for dev-only helpers such as `/api/dev/agent-login`.

## Validation

Run the narrowest useful checks after changes:

```bash
pnpm typecheck
pnpm lint
```
