# Neon

We recommend [Neon](https://neon.com) for self-hosters who want managed
Postgres. Run the Sastra app on your own server or container platform, and
connect it to a Neon database. Sastra uses standard Postgres connections through
Postgres.js and Drizzle ORM; no Neon API key is required for self-hosting.

You still need the app runtime, file storage, email, and scheduler described in
the [self-hosting guide](./README.md).

## 1. Create the database

Create a Neon project with PostgreSQL 17, in a region close to your app server.
Use a separate database for each Sastra installation.

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

## 3. Start Sastra

Use the [Coolify Dockerfile build pack](./coolify.md) or deploy the published
`ghcr.io/sastra-cloud/sastra:<tag>` image on your container platform. Provide
the database variables above alongside the other required app variables.
The image applies migrations and workspace bootstrap data on startup by
default. If your platform runs those in a separate release step, use:

```sh
node scripts/migrate.mjs && node scripts/bootstrap-workspace.mjs
```

and set `MIGRATE_ON_START=false` on the app container.

The stock [Compose bundle](./compose.md) sets `DATABASE_URL` to its bundled
Postgres and depends on that service. Setting a Neon URL in `.env` alone will
not switch that bundle to Neon; use the container or Dockerfile deployment
described above.

After startup, check `/api/ready` for database and schema readiness, then
complete the first-admin setup from the self-hosting guide.

## Backups and usage

Choose a Neon plan and restore window that fit your backup needs. Use the
direct connection for `pg_dump`, and back up the file bucket separately.
Database activity from background jobs and the scheduler can keep a Neon
compute active; review actual usage in Neon when choosing compute settings.
