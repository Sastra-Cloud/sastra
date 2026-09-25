# Contributing to Sastra

Thanks for helping. Sastra is a project planner for publishing and translation
teams, built and used by small ministries. Contributions that make it easier to
run, clearer to use, or more reliable are the most welcome.

## Before you start

- **Bugs and small fixes:** open an issue or a pull request straight away.
- **New features or behavior changes:** open an issue first so we can agree on
  the shape. Sastra is deliberately a single-workspace product with plain
  language for ESL users; some ideas will not fit.
- **Security problems:** see `SECURITY.md`. Do not open a public issue.

## Local setup

```bash
docker compose up -d          # Postgres (pgvector), Mailpit, MinIO
cp .env.example .env
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:3243
```

`/login` offers "Create the first admin" on an empty database.

## Working on a change

- Branch from `main`. One change per pull request.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` before opening the PR.
  `pnpm build` must also pass.
- Schema changes: edit `lib/db/schema/*.ts`, then run
  `pnpm db:generate --name <short_name>` and commit the generated migration,
  snapshot, and journal together. Never edit an applied migration.
- User-facing changes: update the matching help topic in `content/help/*.md`.
  The in-app Help page and the assistant both read these files, so stale docs
  become wrong answers.
- UI copy: short sentences, common words, one term per concept. See
  `docs/copy-style-guide.md` and `docs/terminology.md`.
- Mutations: follow the optimistic-UI and action-feedback rules in `AGENTS.md`,
  and classify new client actions in `lib/actions/interaction-policy.ts`.
- After changing routes, exported symbols, or schema, run `pnpm ai:map` and
  commit the regenerated `.ai/` files.

## Pull requests

Describe what changed and why, how you verified it, and any migration or
environment-variable changes. Keep the PR template's checklist honest.

By contributing you agree that your contribution is licensed under the
AGPL-3.0, like the rest of the project (see `LICENSE`). We do not require a
contributor license agreement.

## Code of conduct

This project follows the Contributor Covenant (`CODE_OF_CONDUCT.md`).
