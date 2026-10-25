# Docker Compose

Runs Sastra, Postgres (pgvector), a one-shot migration step, and a scheduler on
one server. The database image pins PostgreSQL 18.6 and pgvector 0.8.6 for
Intel and ARM, using a volume mounted at `/var/lib/postgresql` and
`PGDATA=/var/lib/postgresql/18/docker`. Put a reverse proxy with HTTPS in front (Caddy, Traefik, nginx).

```bash
mkdir sastra && cd sastra
curl -fsSLO https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/docker-compose.yml
curl -fsSL  https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/.env.example -o .env
# (each GitHub release also attaches these two files as docker-compose.yml and compose.env.example)
# edit .env: POSTGRES_PASSWORD, BETTER_AUTH_URL, BETTER_AUTH_SECRET,
#            AUTH_PROVISIONING_SECRET, CRON_SECRET,
#            APP_ENCRYPTION_KEY, email, storage, ENABLE_INITIAL_ADMIN_BOOTSTRAP=true
#            plus INITIAL_ADMIN_EMAIL/TOKEN
docker compose up -d
docker compose logs -f migrate app
```

Then open your URL: `/login` shows **Create the first admin**. Enter the email
and token from `.env`, complete the workspace setup, and invite your team from
**Settings ▸ Team**. Afterwards set `ENABLE_INITIAL_ADMIN_BOOTSTRAP=false` in
`.env` and run `docker compose up -d` again so the screen cannot reappear.

## Use Neon for the database

For a new installation with managed Postgres, use the ready-made
`deploy/compose/docker-compose.neon.yml` bundle. It runs the same app image,
migration step, scheduler, and optional MinIO file storage, and connects to
your database without running a local Postgres container. See the
[Neon guide](./neon.md) for the download commands and connection setup.

## Files without an external bucket

Both Compose bundles offer an optional `minio` profile. Before starting it,
set `MINIO_ROOT_PASSWORD` in `.env` to a unique generated secret (for example,
generate one with `openssl rand -base64 32`). Set `R2_ACCESS_KEY_ID` to
`MINIO_ROOT_USER` (default `sastra`) and `R2_SECRET_ACCESS_KEY` to the same
password. Single-quote values in `.env` if they contain literal `$` characters
so Compose does not interpolate them.

```bash
docker compose --profile minio up -d
```

An unset or empty `MINIO_ROOT_PASSWORD` makes both the MinIO server and bucket
initializer exit before contacting storage or starting MinIO. The server may
keep restarting under its restart policy. Set the password and matching
`R2_SECRET_ACCESS_KEY`, then rerun the command above to recreate the services
with the updated settings. There is no fallback password. Deployments without
the `minio` profile do not need this variable.

Browser uploads go straight to the bucket. Set `R2_ENDPOINT` to the MinIO API
URL reachable from both the app and users' browsers, such as
`https://files.example.org`. Route that hostname through your HTTPS proxy to
MinIO's API on port 9000, and configure bucket CORS for your app's origin.
`http://minio:9000` works inside the Compose network but is not a usable endpoint
for remote browsers. The bundle does not publish port 9000 on the host; your
proxy must join the Compose network or use an explicitly configured API port
mapping. An external S3-compatible bucket is another option for a public
installation.

The administration console is separate from the S3 API. Its host port binds to
`127.0.0.1:9001` by default (`MINIO_CONSOLE_PORT` changes the port, not the bind
address). For remote administration, forward it over SSH:

```bash
ssh -N -L 9001:127.0.0.1:9001 user@your-server
```

Then open `http://localhost:9001`. Adjust the forwarded remote port if you change
`MINIO_CONSOLE_PORT`. Browser uploads need access to port 9000 through the API
proxy, not the administration console.

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
