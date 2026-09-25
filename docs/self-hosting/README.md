# Self-hosting Sastra

Sastra is a single-organization application: one installation serves one
publishing or translation team. You need:

| Piece | What works |
|---|---|
| Runtime | The container image `ghcr.io/sastra-cloud/sastra:<tag>` (linux/amd64 and linux/arm64), or a build from this repository's `Dockerfile` |
| Database | PostgreSQL 16 or newer with the `vector` extension (the `pgvector/pgvector` images have it) |
| Files | Any S3-compatible bucket: Cloudflare R2, AWS S3, Railway Buckets, MinIO |
| Email | Resend (HTTPS) or any SMTP provider. Required: sign-in links and invitations are email |
| AI | An OpenRouter key, set as `OPENROUTER_API_KEY` or pasted by an admin in Settings ▸ AI. Optional; the app works without AI |
| Scheduler | Anything that can `POST /api/cron/tick` once a minute with the `CRON_SECRET` bearer token |

Guides:

- [Docker Compose](./compose.md): everything on one server, including Postgres and optional MinIO.
- [Coolify](./coolify.md): the Compose or Dockerfile build pack on a Coolify server.
- [Railway](./railway.md): the one-click template.

Reference:

- [Environment variables](./environment.md)
- Upgrades: pull the new tag; migrations run in the `migrate` step (Compose) or at container start (`MIGRATE_ON_START=true`, the default). Migrations are forward-only; back up first.
- Health: `GET /api/health` (liveness, no database) and `GET /api/ready` (database, schema, bootstrap; 503 with reasons until ready).
- Version: `GET /api/version` reports the version and source revision; the same link is in the app sidebar.

Sastra is AGPL-3.0 licensed. If you modify it and let people use it over a
network, you must offer them the corresponding source; the built-in **Source**
link points at the running version's code, so keep it pointing at your fork.
Hosting without the operations work is what [Sastra Cloud](https://sastra.cloud)
sells; the software is the same.
