# Neon

We recommend [Neon](https://neon.com) for self-hosters who want managed
Postgres. Run the Sastra app on your own server or container platform, and
connect it to a Neon database. Sastra uses standard Postgres connections through
Postgres.js and Drizzle ORM; no Neon API key is required for self-hosting.

You still need the app runtime, file storage, email, and scheduler described in
the [self-hosting guide](./README.md).

## 1. Create the database

Create a Neon project with PostgreSQL 18, in a region close to your app server.
Use a separate database for each Sastra installation. Neon controls minor patch
availability: check `SHOW server_version` and record the actual version. The
minimum is major version 18; the bundled database is pinned to 18.6. For an
existing older project, follow the [upgrade guide](./postgresql-upgrade.md);
changing an app connection string does not upgrade or transfer its data.

Sastra requires the `vector` extension for document search. Its migrations
enable the extension automatically, so the migration role must be allowed to
create it. You can also enable it first in the Neon SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Neon supports this extension; see its [pgvector documentation](https://neon.com/docs/extensions/pgvector).

## 2. Configure the connections

In the Neon Console, choose **Connect** and copy the connection strings for
the same database and role:

- Set `DATABASE_URL` to the **pooled** connection string. Its hostname contains
  `-pooler`.
- Set `DATABASE_MIGRATION_URL` to the **direct** connection string, with pooling
  turned off. Sastra's migration runner uses a session advisory lock, so it
  needs a direct connection.

Set `sslmode=verify-full` in both URLs, replacing `sslmode=require` if present.
Keep the actual hostnames, credentials, and other connection parameters supplied
by Neon. Neon uses publicly trusted certificates, so you do not need Coolify's
private CA or its `NODE_EXTRA_CA_CERTS` setting. See
[Neon's secure connection guidance](https://neon.com/docs/connect/connect-securely).

These are placeholders; replace each URL with your Neon connection string:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@POOLED_HOST/DATABASE?sslmode=verify-full"
DATABASE_MIGRATION_URL="postgresql://USER:PASSWORD@DIRECT_HOST/DATABASE?sslmode=verify-full"
DB_MAX_CONNECTIONS="3"
```

Sastra detects Neon's pooled hostname and disables prepared statements for that
connection. Leave `DB_PREPARE` unset, or set it to `false`. The small app pool
above is a starting point for a small team. See the
[environment reference](./environment.md) for connection settings and
[Neon's pooling guide](https://neon.com/docs/connect/connection-pooling) for
pooled and direct connection behavior.

## 3. Start Sastra with Docker Compose

For a new installation, download the Neon Compose bundle and the shared
environment template into a new folder:

```sh
mkdir sastra-neon && cd sastra-neon
curl -fsSL https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/docker-compose.neon.yml -o docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/Sastra-Cloud/sastra/main/deploy/compose/.env.example -o .env
```

Edit `.env`. Uncomment and fill in `DATABASE_URL` and
`DATABASE_MIGRATION_URL` using the pooled and direct URLs above. Leave
`POSTGRES_PASSWORD` blank: this bundle does not start a local Postgres
container. Set the app address, auth and cron secrets, file storage, email,
and first-admin settings from the template. Pin `SASTRA_TAG` to the release
you want to run.

```sh
docker compose up -d
docker compose logs -f migrate app
```

The bundle applies migrations and workspace bootstrap data over the direct
connection, then starts the app with its pooled connection. It also runs the
scheduler. Optional local file storage works with
`docker compose --profile minio up -d`; see the
[Compose guide](./compose.md#files-without-an-external-bucket) for those settings.

After startup, check `/api/ready` for database and schema readiness, then
complete the first-admin setup from the [Compose guide](./compose.md).

### Other container platforms

You can also use the [Coolify Dockerfile build pack](./coolify.md) or deploy the
published `ghcr.io/sastra-cloud/sastra:<tag>` image on another container
platform. Provide the same database variables alongside the other required
app variables. The image applies migrations and workspace bootstrap data on
startup by default. If your platform runs those in a separate release step, use:

```sh
node scripts/migrate.mjs && node scripts/bootstrap-workspace.mjs
```

and set `MIGRATE_ON_START=false` on the app container.

The default local-database Compose bundle sets `DATABASE_URL` to its bundled
Postgres. Use the Neon bundle above when installing with an external database.
Changing a connection URL does not copy an existing installation's data; restore
its database backup into Neon before pointing that installation at Neon.

## Backups and usage

Choose a Neon plan and restore window that fit your backup needs. Use the
direct connection for `pg_dump`, and back up the file bucket separately.
Database activity from background jobs and the scheduler can keep a Neon
compute active; review actual usage in Neon when choosing compute settings.
