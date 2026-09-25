---
paths:
  - "lib/db/schema/**"
  - "drizzle/**"
  - "drizzle.config.ts"
description: "Drizzle schema and migration workflow"
---

# Drizzle Migrations

Schema lives in `lib/db/schema/`. Generated SQL migrations live in `drizzle/`.

## Rules

- Edit schema files first, then generate migrations with `pnpm db:generate`.
- Do not hand-edit `drizzle/meta/**` unless the user explicitly asks for migration repair.
- Keep schema changes and generated migration files in the same commit.
- Review generated SQL before trusting it.
- Use `pnpm db:migrate` to apply migrations locally.
- Do not run destructive database commands against production from an agent session.

## Useful checks

```bash
pnpm db:generate
pnpm db:migrate
pnpm typecheck
```

If a migration touches existing data, explain the data impact and rollback strategy before applying it.
