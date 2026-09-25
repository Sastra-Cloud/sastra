# Help documentation upkeep

`content/help/*.md` is the **single source of truth** for user-facing help. It is
consumed by two surfaces, so it must stay accurate:

1. The in-app **Help page** (`app/(app)/help/page.tsx` → `components/help/help-browser.tsx`).
2. The in-app **assistant**, which is grounded in these docs via the
   `search_help_docs` tool (`lib/assistant/tools.ts`) and a topics index in its
   system prompt (`lib/assistant/prompt.ts`, `lib/help/content.ts`).

**Stale docs = wrong assistant answers.** The assistant only describes features
the docs (or a live tool result) confirm, and it tells users a feature "may not
exist" when the docs don't cover it. If you ship a feature and don't document it,
the assistant will tell users it doesn't exist.

## When this rule applies

When you add, change, rename, or remove a **user-facing** feature — anything a
user sees or does. In practice that means changes under:

- `app/(app)/**` routes and their feature components in `components/**`
- user-facing capabilities/roles in `lib/auth/policy.ts`
- assistant abilities/tools in `lib/assistant/**`

## What to do

- **Changed a feature:** update the matching `content/help/<topic>.md` body, and
  keep its frontmatter current — especially `keywords` and `summary`, which drive
  assistant search and the topics index, and `roles`, which drives the role badge.
- **New feature area:** add a new `content/help/<slug>.md` with full frontmatter
  (`title`, `category`, `roles`, `keywords`, `order`, `summary`). Reuse an
  existing `category`; pick an `order` that slots it sensibly.
- **Removed a feature:** delete or correct the topic so the docs and assistant
  stop referencing it.
- Keep frontmatter to the simple format the loader parses (`key: value`, quoted
  scalars, and inline `[a, b]` lists) — see `lib/help/content.ts`.

## Validation

```bash
pnpm typecheck
pnpm exec eslint lib/help lib/assistant "app/(app)/help"
```

No `pnpm ai:map` is needed for content-only edits (`content/` is not scanned),
but run it if you add exported symbols in `lib/help/**` or a new assistant tool.
