# Railway

Sastra has a one-click Railway template that creates the app, a Postgres
database with pgvector, and a Railway Bucket for files. Railway bills your own
account by usage; a small team typically stays under $10 a month.

**Deploy:** use the "Deploy on Railway" button in the README, or search for
"Sastra" in Railway's template gallery.

Check the database service before deploying Sastra 0.2.0: it requires
PostgreSQL 18 or newer with pgvector. Use the pinned PostgreSQL 18.6 image
from the Compose bundle, mount the data volume at `/var/lib/postgresql`, and
set `PGDATA=/var/lib/postgresql/18/docker` for a new service. Existing older
databases need the [dump-and-restore upgrade](./postgresql-upgrade.md).

After deploying:

1. Set `BETTER_AUTH_URL` to the public URL Railway assigned (or your custom
   domain), then redeploy.
2. Email: Railway blocks outbound SMTP on the Hobby plan, so set
   `RESEND_API_KEY` and `EMAIL_FROM` (a verified domain on Resend).
3. Files: the template wires the Bucket's `S3_*` variables automatically.
4. Set `ENABLE_INITIAL_ADMIN_BOOTSTRAP=true`, `INITIAL_ADMIN_EMAIL` and
   `INITIAL_ADMIN_TOKEN`, open `/login`, and create the first admin. Then set the
   flag back to `false`.
5. The template includes a cron service that calls `/api/cron/tick` every
   minute. Keep it running.

Migrations run at container start (`MIGRATE_ON_START=true`). To upgrade, change
the image tag in the service settings and redeploy.

Sastra Cloud itself does not run on Railway; the template is for your own
account.
