---
paths:
  - "package.json"
  - "pnpm-lock.yaml"
  - "pnpm-workspace.yaml"
description: "Dependency changes, pnpm lockfile discipline, and no silent upgrades"
---

# Dependency Hygiene

This repo uses pnpm with a committed `pnpm-lock.yaml` and CI runs `pnpm install --frozen-lockfile`.

## Rules

- Do not run `pnpm update` or broad upgrade commands unless the user explicitly asks for upgrades.
- Do not hand-edit `pnpm-lock.yaml`.
- If adding or changing a dependency, explain why it is needed and commit the lockfile change with `package.json`.
- Prefer `pnpm install --frozen-lockfile` when materializing existing dependencies.
- Be cautious with new packages. Check whether existing dependencies or platform APIs already solve the problem.
- Do not add install-time or postinstall tooling without calling out the security tradeoff.

## Validation

For dependency changes, run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

If `--frozen-lockfile` fails because the manifest intentionally changed, run the normal install only after confirming the dependency change is intentional.
