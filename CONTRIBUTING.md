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

Use the Node.js version pinned in `.nvmrc`. With nvm, run `nvm install` and
`nvm use` from the repository root. Node 26 does not bundle Corepack, so install
the pinned package manager with `npm install --global pnpm@10.32.1`.

```bash
docker compose up -d          # Postgres (pgvector), Mailpit, MinIO
cp .env.example .env
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                      # http://localhost:3243
```

`/login` offers "Create the first admin" on an empty database.

Keep `.nvmrc` and the Dockerfile's Node version aligned when updating Node.
Runtime security fixes require rebuilding and redeploying the image. After
deployment, verify `node --version` inside the running container; restarting an
existing container does not update its Node runtime.

## Working on a change

Local checks, CI, and production builds use tsrs, the Rust TypeScript checker.
Run `pnpm typecheck` (or its alias `pnpm typecheck:tsrs`) for the normal check.
Run `pnpm typecheck:tsc` to compare with the official TypeScript 7 compiler;
the two compilers use separate incremental caches. The pinned tsrs release
targets TypeScript 7.1 development behavior, so investigate diagnostic
differences. Its published binaries support macOS ARM64 and Linux x64/ARM64.

`pnpm build` generates Next.js route types, requires a successful tsrs check,
builds the app, then checks the final generated types with tsrs. Any failure
fails the build. The build wrapper skips Next.js's duplicate compiler check
only for its bundler child; invoking `next build` directly retains the official
TypeScript check.

Tests that inspect or transpile source import Microsoft's
`@typescript/typescript6` compatibility package for its JavaScript compiler API.
The pnpm install hook in `.pnpmfile.cjs` gives API-based tools, including ESLint,
the same package.

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

Add tests when they protect against a meaningful production failure. Reuse or
update existing coverage first; copy, styling, documentation, and mechanically
equivalent changes do not require new tests on their own. Follow the
[test-value policy](.claude/rules/testing.md) when choosing or pruning coverage.
The pre-PR checks above still apply.

## Pull requests

Describe what changed and why, how you verified it, and any migration or
environment-variable changes. Keep the PR template's checklist honest.

By contributing you agree that your contribution is licensed under the
AGPL-3.0, like the rest of the project (see `LICENSE`). We do not require a
contributor license agreement.

## Code of conduct

This project follows the Contributor Covenant (`CODE_OF_CONDUCT.md`).
