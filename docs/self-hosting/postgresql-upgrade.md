# Upgrade PostgreSQL for Sastra

Sastra **0.2.0 requires PostgreSQL 18 or newer**. The bundled database pins
PostgreSQL 18.6 and pgvector 0.8.6 to a multi-architecture image digest. Startup,
migrations, and workspace bootstrap reject older major versions before serving
requests or changing the schema. Builds do not connect to a database.

This guide is for operators preserving an existing workspace. Do not run seed
scripts or reset a database during an upgrade. Back up the file bucket separately.

## Choose the procedure

Check `SHOW server_version` and `SELECT extversion FROM pg_extension WHERE
extname = 'vector'` using an administrative connection.

- **17 → 18:** dump and restore into a new volume. A PostgreSQL 18 server cannot
  open PostgreSQL 17 data files. Changing the image or moving files is insufficient.
- **18.x → 18.6:** keep the existing data volume and `PGDATA`, back up and test
  first, then change the image and restart. No major-version data conversion is needed.
- **Neon:** create/select a PostgreSQL 18 project and migrate older projects
  explicitly. The provider controls patch versions; record `SHOW server_version`
  rather than assuming 18.6. Use direct connections for dumps and migrations,
  pooled connections for the app, and `sslmode=verify-full` for both.

See [PostgreSQL's upgrade policy](https://www.postgresql.org/support/versioning/)
and [Docker's PostgreSQL storage guidance](https://hub.docker.com/_/postgres).

## 17 → 18 with Docker Compose

1. Stop Sastra's app, scheduler, migration jobs, and other database clients.
   For self-hosting: `docker compose stop app scheduler`. For development, stop
   `pnpm dev` and any other Sastra database clients; leave unrelated projects alone.
2. **Before replacing the old Compose file**, save it and take private backups:

   ```sh
   umask 077
   mkdir -p backups/postgresql17
   cp docker-compose.yml backups/postgresql17/compose17.yml
   docker compose exec -T postgres pg_dump -U sastra -d sastra -Fc > backups/postgresql17/database.dump
   docker compose exec -T postgres pg_dumpall -U sastra --roles-only > backups/postgresql17/roles.sql
   docker compose exec -T postgres psql -U sastra -d sastra -Atc 'SELECT count(*), max(created_at) FROM drizzle.__drizzle_migrations' > backups/postgresql17/migrations.txt
   ```

   Record exact counts for all application tables, sequence values, extensions,
   ownership/grants, and the old image digest/volume configuration. Role dumps
   contain password hashes: store them privately and never commit them.
3. Test restoration before switching. Use the target image in an isolated
   PostgreSQL 18 container, with no app, scheduler, email, or external integrations
   attached. Restore roles first when preserving ownership and grants. Use a
   distinct initial administrator such as `restore_admin` so source role creation
   does not collide; review any already-existing roles explicitly. Restore the
   database with `pg_restore --exit-on-error`, then verify the recorded data.
   A logical restore creates extensions at the target image's default version.
   To test an extension's in-place update, also restore with the original image,
   restart that isolated volume with the target image, and update the extension.
4. Stop the old database: `docker compose stop postgres`. Keep its named volume.
   Replace the Compose file with the 0.2.0 bundle. It uses **`pgdata18`** for
   self-hosting and **`sastra-pgdata18`** for development, leaving the old volume
   intact. Mount the new volume at **`/var/lib/postgresql`**, with
   **`PGDATA=/var/lib/postgresql/18/docker`**.
5. Start **only** the database and restore the backup:

   ```sh
   docker compose up -d postgres
   docker compose exec -T postgres pg_isready -U sastra -d sastra
   docker compose exec -T postgres pg_restore -U sastra -d sastra --exit-on-error < backups/postgresql17/database.dump
   ```

   These commands assume the source used only the existing `sastra` owner role,
   which Compose creates with the configured password. If other roles are needed,
   restore the reviewed role definitions first; do not discard owners or grants.
   Ensure the new database is empty and healthy before restoring. Restore into a
   new database rather than using `--clean` against an existing workspace.
6. Verify table counts, migration history, sequence values, owners/grants, and
   vector search match the source. Check both Wiki and agreement HNSW indexes.
   Test a representative write only on the isolated copy. Run `ANALYZE` on the
   restored database. Test the extension upgrade there before applying
   `ALTER EXTENSION vector UPDATE TO '0.8.6'` with an administrator on the
   restored installation. A read-only diagnostic account cannot do this.
7. Start Sastra. Self-hosting: `docker compose up -d`; development:
   `pnpm db:migrate && pnpm dev`. The migrations and baseline bootstrap preserve
   existing administrator edits. Verify `/api/health`, `/api/ready`, and TLS.
   Keep the original volume and private backup for **at least seven days**.

Do not use `docker compose down -v`. Do not delete the old volume until the
retention period and verification have passed. To recover before new writes,
stop the new clients/database and restore the old Compose file and application
version. After new writes, plan reconciliation before returning to the older copy.

## 18.x patch update on Coolify or another host

1. Record the running image digest, volume source/target, `PGDATA`, database
   configuration, TLS settings/mounts, roles/grants, extensions, migration history,
   and aggregate table counts.
2. Take a fresh logical backup and role dump. Restore them on the production
   host into an isolated container and test the **exact target image**:

   ```text
   pgvector/pgvector:0.8.6-pg18-bookworm@sha256:2ba9ca5f2e7daa0f0e7723cba1ee9167bab54efd3640516a44ac1a928dd67e7a
   ```

   Test `ALTER EXTENSION vector UPDATE TO '0.8.6'` and HNSW searches on the copy.
   Keep it disconnected from all operational integrations.
3. Pause app clients and schedulers for the maintenance window and take a final
   backup. Change only the database image and restart. **Keep its existing volume,
   `PGDATA`, credentials, TLS, ports, and configuration.** New installations use
   the 18 directory layout; existing 18 installations may have an explicit older
   path that must remain unchanged during a patch update.
4. Confirm the server is 18.6, encrypted connections work, and data counts match.
   Then use an authorized administrator to apply the tested vector update.
   Resume clients and verify health/readiness and database error logs without
   sending emails or creating business records.
5. Configure daily backups to a private dedicated R2/S3 backup bucket, retain
   at least seven daily copies, verify the upload, and repeat restore drills.

If restart fails **before** updating the extension, return to the recorded old
image/configuration. If recovery is needed **after** updating the extension,
restore the verified pre-update database and roles with the original image and
configuration. An image-only rollback is not a tested extension downgrade.
