# Sastra

Sastra is a project planner for publishing and translation teams: books,
articles, podcasts, and video series move through their stages with clear
ownership; rights, budgets, print runs, and funding are tracked with blockers;
correspondence with publishers and printers lands in one place; and built-in
AI agents draft, extract, and summarize so the team spends less time on
administration. It is built for small ministry teams, many of whom read English
as a second language, so the interface uses plain words and one term per idea.

Sastra is **free software under the AGPL-3.0**. You can self-host it, or let
[Sastra Cloud](https://sastra.cloud) run it for you. Both run the same code.

## Self-host

The quickest path is the Compose bundle: Postgres, the app, migrations, and a
scheduler on one server.

```bash
mkdir sastra && cd sastra
curl -fsSLO https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/.env.example -o .env
# fill in .env, then:
docker compose up -d
```

Guides for [Docker Compose](./docs/self-hosting/compose.md),
[Coolify](./docs/self-hosting/coolify.md), and [Railway](./docs/self-hosting/railway.md),
plus the full [environment reference](./docs/self-hosting/environment.md), are in
[`docs/self-hosting/`](./docs/self-hosting/README.md). Container images are
published at `ghcr.io/sastra-cloud/sastra` for `linux/amd64` and `linux/arm64`.

You need PostgreSQL with `pgvector`, an S3-compatible bucket, an email provider
(Resend or SMTP), and optionally an OpenRouter key for the AI features.

## Sastra Cloud

One flat plan per workspace with hosting, a ready correspondence address,
backups, upgrades, included AI credits, and support. See
[sastra.cloud](https://sastra.cloud). The hosted service adds operations, not
features; the application is this repository.

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind v4** + **shadcn/ui** (Base UI), dark mode
- **PostgreSQL** + **Drizzle ORM**, `pgvector` for semantic search
- **Better Auth** (password, magic link, passkeys)
- Email through **Resend** or **SMTP**; inbound mail by IMAP or webhook
- Files on any **S3-compatible** bucket
- AI through **OpenRouter** with per-task model choice

## Local development

```bash
docker compose up -d      # Postgres (pgvector), Mailpit (http://localhost:8025), MinIO
cp .env.example .env      # defaults already target the local containers
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                  # http://localhost:3243
```

`/login` shows **Create the first admin** on an empty database. Useful commands:

| Command | What |
|---|---|
| `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` | what CI runs |
| `pnpm db:generate --name <name>` | write a migration after editing `lib/db/schema/` |
| `pnpm ai:map` | regenerate the `.ai/` context index after route or schema changes |
| `pnpm agent-browser:open /dashboard` | open an authenticated local session for UI review |

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to propose changes,
[`SECURITY.md`](./SECURITY.md) for reporting vulnerabilities, and
[`SUPPORT.md`](./SUPPORT.md) for where to ask questions.

## License

AGPL-3.0-only. See [`LICENSE`](./LICENSE), [`NOTICE`](./NOTICE), and the
[trademark policy](./TRADEMARKS.md) for the Sastra name and logo. Every
installation links to the source of the version it runs (the **Source** link in
the sidebar and on the sign-in screen), which is how the AGPL's network clause
is met; forks should point it at their own code with
`SASTRA_SOURCE_REPOSITORY_URL`.
