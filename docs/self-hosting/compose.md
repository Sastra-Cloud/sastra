# Docker Compose

Runs Sastra, Postgres (pgvector), a one-shot migration step, and a scheduler on
one server. Put a reverse proxy with HTTPS in front (Caddy, Traefik, nginx).

```bash
mkdir sastra && cd sastra
curl -fsSLO https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/.env.example -o .env
# (each GitHub release also attaches these two files as docker-compose.yml and compose.env.example)
# edit .env: POSTGRES_PASSWORD, BETTER_AUTH_URL, BETTER_AUTH_SECRET, CRON_SECRET,
#            APP_ENCRYPTION_KEY, email, storage, INITIAL_ADMIN_EMAIL/TOKEN
docker compose up -d
docker compose logs -f migrate app
```

Then open your URL: `/login` shows **Create the first admin**. Enter the email
and token from `.env`, complete the workspace setup, and invite your team from
**Settings ▸ Team**.

## Files without an external bucket

```bash
docker compose --profile minio up -d
```

and in `.env` set `R2_ENDPOINT=http://minio:9000`, `R2_ACCESS_KEY_ID` to
`MINIO_ROOT_USER`, and `R2_SECRET_ACCESS_KEY` to `MINIO_ROOT_PASSWORD`. Browser
uploads go straight to the bucket, so the MinIO API port must also be reachable
from users' browsers through your proxy (or use an external bucket, which is
simpler for a public installation).

## Upgrading

```bash
# edit SASTRA_TAG in .env to the new release
docker compose pull
docker compose up -d
```

The `migrate` service applies new migrations before the app starts. Take a
database backup first: `docker compose exec postgres pg_dump -U sastra sastra > backup.sql`.

## Backups

Back up the Postgres volume (or `pg_dump` nightly) and the file bucket. A
restore is a fresh `docker compose up -d` against the restored database and
bucket; newer migrations apply on start.

## Scheduler

The `scheduler` service calls `POST /api/cron/tick` every minute. If you prefer
your own cron, remove the service and run:

```bash
curl -fsS -X POST https://your-host/api/cron/tick -H "Authorization: Bearer $CRON_SECRET"
```
